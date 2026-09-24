import {
  OPENAI_COMPATIBLE_ENV_VAR,
  PROVIDER_ENV,
  processEnvironment,
} from "@verbatra/ai-providers";
import type { LiteralScan } from "@verbatra/extract";
import type { AdapterRegistry, FormatAdapter } from "@verbatra/format-adapters";
import {
  type ConfigSource,
  type LoadConfigOptions,
  type LoadedConfig,
  loadConfigWithMeta,
} from "../config/load-config.js";
import { describeLocaleCodes } from "../config/locale-code.js";
import {
  hasProviderFactory,
  isMachineProvider,
  PROVIDER_IDS,
  type ProviderConfig,
} from "../config/provider-config.js";
import type { VerbatraConfig } from "../config/schema.js";
import { errorMessage, SdkError } from "../errors.js";
import { defaultFs, type SdkFs } from "../fs.js";
import { createLocalePathResolver, type LocalePathResolver } from "../locale-path/resolver.js";
import type { ScanProgressListener } from "../progress/types.js";
import { selectAdapter } from "../selection/select-adapter.js";
import { describeLiteralScan, isCleanLiteralScan, lintLiterals } from "./literal-lint.js";
import { describeLocaleState } from "./locale-state-doctor.js";
import { checkNetworkPolicy } from "./network-doctor.js";
import { describePluralRules } from "./plural-rules.js";
import { readSourceResource } from "./source.js";

/**
 * Which project-setup question a {@link DoctorCheck} answers.
 *
 * - `config`: a config file was found and passes validation.
 * - `format-adapter`: the configured `format` resolves to a file adapter.
 * - `provider`: the configured `provider.id` resolves to a provider factory. It passes for `none`,
 *   reporting that machine translation is disabled by policy.
 * - `api-key`: the environment variable the configured provider reads its key from is set. It
 *   passes for `none`, which reads no API key.
 * - `network-policy`: the effective network policy, from the config's `network` block and the
 *   `VERBATRA_NETWORK_POLICY` environment variable, permits the configured provider's endpoint and
 *   any proxy it would use. The detail names the effective policy, both of its sources, and the host
 *   the provider connects to. It fails when that host is refused or when either environment
 *   variable holds an invalid value, and passes for `none`. It resolves no host name.
 * - `source-file`: the source locale file exists at its resolved path, is a regular file, and
 *   parses under the configured format.
 * - `plural-rules`: informational, never fails. Names the ICU and CLDR versions the runtime derives
 *   plural categories from, and every target locale ICU has no plural rules for, which falls back to
 *   `one` and `other` and gets no generated plural forms.
 * - `locale-codes`: informational, never fails. Names every configured locale code that is valid
 *   but not in canonical BCP 47 form, such as `zh-hant-tw` or the deprecated `iw`, with the
 *   canonical form `Intl.getCanonicalLocales` suggests for it.
 * - `locale-state`: informational, never fails. Names every locale that has state in the lock
 *   file, the translation memory, or the provenance file but is not configured, such as `pt_BR`
 *   left behind after the config respelled it `pt-BR`, says whether the next {@link translate} run
 *   carries it over to the configured spelling, and suggests removing it or respelling the
 *   configured locale otherwise.
 * - `untranslated-literals`: the application source configured in the `extract` block holds no
 *   hardcoded user-facing string literal and no file the scan could not read. It runs only when
 *   {@link DoctorInput.literals} is set.
 */
export type DoctorCheckId =
  | "config"
  | "format-adapter"
  | "provider"
  | "api-key"
  | "network-policy"
  | "source-file"
  | "plural-rules"
  | "locale-codes"
  | "locale-state"
  | "untranslated-literals";

/**
 * The verdict on one {@link DoctorCheck}. `skipped` is reported only for the checks that need a
 * loaded config when the `config` check itself failed, so a skipped check is never a problem of its
 * own.
 */
export type DoctorCheckStatus = "pass" | "fail" | "skipped";

/** One project-setup question and its verdict. */
export interface DoctorCheck {
  /** Which question this check answers. */
  readonly id: DoctorCheckId;
  /** A short human-readable name for the check, stable across runs. */
  readonly title: string;
  /** The verdict. Only `fail` makes {@link DoctorResult.ok} false. */
  readonly status: DoctorCheckStatus;
  /**
   * Why the check reached its verdict. On a failure this carries the underlying error message
   * verbatim, so a config validation problem reads exactly as {@link loadConfig} words it. It names
   * environment variables and paths, never an API key value.
   */
  readonly detail: string;
}

/** The result of {@link doctor}: every check that ran, and one project-wide verdict. */
export interface DoctorResult {
  /** True only when no check failed. This is the value a script should branch on. */
  readonly ok: boolean;
  /**
   * Every check that ran, always in the same order. A setup run has nine entries, one per setup
   * check: `config`, `format-adapter`, `provider`, `api-key`, `network-policy`, `source-file`,
   * `plural-rules`, `locale-codes`, and `locale-state`. A literal run
   * ({@link DoctorInput.literals}) has exactly two: `config` and `untranslated-literals`.
   */
  readonly checks: readonly DoctorCheck[];
  /**
   * What the untranslated-literal scan found. Present only on a literal run whose scan actually
   * ran; absent when the config could not be loaded, no `extract` block is configured, the file
   * system cannot list directories, or the scan failed to start, each of which fails the
   * `untranslated-literals` check instead.
   */
  readonly literals?: LiteralScan;
}

/** Input for {@link doctor}. */
export interface DoctorInput {
  /** Directory to search the config from, and the base for locale paths. Defaults to the process working directory. */
  readonly cwd?: string;
  /** An explicit config file to validate, bypassing the search. A missing file is an error rather than a failed check. */
  readonly configPath?: string;
  /**
   * Run the untranslated-literal scan instead of the setup checks: the config is loaded, then the
   * source roots of its `extract` block are scanned for hardcoded user-facing string literals. No
   * other setup check runs (`format-adapter`, `provider`, `api-key`, `network-policy`,
   * `source-file`, `plural-rules`, `locale-codes`, `locale-state`), so no API key environment
   * variable is looked at and a run with no key set can pass.
   */
  readonly literals?: boolean;
  /**
   * Called once after each application source file the `literals` scan reads, with the running count and the
   * total, for progress reporting.
   */
  readonly onProgress?: ScanProgressListener;
}

/** Injectable dependencies for {@link doctor}. Every field has a working default. */
export interface DoctorDeps {
  /** Format-adapter registry to resolve the configured format against. Defaults to the built-in registry. */
  readonly adapterRegistry?: AdapterRegistry;
  /**
   * File-system port. Threaded into the config loader, so it backs the glossary-file read the
   * `config` check performs, and used to read and parse the source locale file. On a literal run it
   * backs the source scan, which needs its `readDirectory` member. Defaults to the real file system.
   */
  readonly fs?: SdkFs;
  /** Config loader. Defaults to {@link loadConfigWithMeta}. */
  readonly loadConfig?: (options: LoadConfigOptions) => Promise<LoadedConfig>;
}

const CHECK_TITLES: Record<DoctorCheckId, string> = {
  config: "Configuration",
  "format-adapter": "Format adapter",
  provider: "Provider",
  "api-key": "API key environment variable",
  "network-policy": "Network policy",
  "source-file": "Source locale file",
  "plural-rules": "Plural rules",
  "locale-codes": "Locale codes",
  "locale-state": "Locale state",
  "untranslated-literals": "Untranslated literals",
};

const CONFIG_DEPENDENT_IDS: readonly DoctorCheckId[] = [
  "format-adapter",
  "provider",
  "api-key",
  "network-policy",
  "source-file",
  "plural-rules",
  "locale-codes",
  "locale-state",
];

const SKIPPED_DETAIL = "Not checked: the configuration could not be loaded.";

function check(id: DoctorCheckId, status: DoctorCheckStatus, detail: string): DoctorCheck {
  return { id, title: CHECK_TITLES[id], status, detail };
}

function verdict(id: DoctorCheckId, passed: boolean, detail: string): DoctorCheck {
  return check(id, passed ? "pass" : "fail", detail);
}

function toResult(checks: readonly DoctorCheck[]): DoctorResult {
  return { ok: checks.every((entry) => entry.status !== "fail"), checks };
}

function loadOptionsFor(input: DoctorInput, deps: DoctorDeps): LoadConfigOptions {
  return {
    ...(input.cwd !== undefined ? { cwd: input.cwd } : {}),
    ...(input.configPath !== undefined ? { configPath: input.configPath } : {}),
    ...(deps.fs !== undefined ? { fs: deps.fs } : {}),
  };
}

type LoadOutcome =
  | { readonly kind: "loaded"; readonly loaded: LoadedConfig }
  | { readonly kind: "failed"; readonly detail: string };

function isMissingExplicitConfig(error: unknown, input: DoctorInput): boolean {
  return (
    input.configPath !== undefined && error instanceof SdkError && error.code === "CONFIG_NOT_FOUND"
  );
}

async function loadForDoctor(input: DoctorInput, deps: DoctorDeps): Promise<LoadOutcome> {
  const load = deps.loadConfig ?? loadConfigWithMeta;
  try {
    return { kind: "loaded", loaded: await load(loadOptionsFor(input, deps)) };
  } catch (error) {
    if (isMissingExplicitConfig(error, input)) {
      throw error;
    }
    return { kind: "failed", detail: errorMessage(error) };
  }
}

function configDetail(source: ConfigSource): string {
  return source.kind === "override"
    ? "Validated the config supplied in memory."
    : `Loaded ${source.filepath}.`;
}

type AdapterOutcome =
  | { readonly kind: "resolved"; readonly adapter: FormatAdapter }
  | { readonly kind: "failed"; readonly detail: string };

function resolveAdapter(config: VerbatraConfig, deps: DoctorDeps): AdapterOutcome {
  try {
    const adapter = selectAdapter(config.format, deps.adapterRegistry, deps.fs);
    return { kind: "resolved", adapter };
  } catch (error) {
    return { kind: "failed", detail: errorMessage(error) };
  }
}

function checkAdapter(config: VerbatraConfig, outcome: AdapterOutcome): DoctorCheck {
  return outcome.kind === "resolved"
    ? verdict("format-adapter", true, `Format "${config.format}" resolves to an adapter.`)
    : verdict("format-adapter", false, outcome.detail);
}

const MACHINE_TRANSLATION_DISABLED_DETAIL =
  'Machine translation disabled by policy (provider "none"): translate and watch fill only from ' +
  "the translation memory, and no provider is ever called.";

function checkProvider(provider: ProviderConfig): DoctorCheck {
  if (!isMachineProvider(provider)) {
    return verdict("provider", true, MACHINE_TRANSLATION_DISABLED_DETAIL);
  }
  return hasProviderFactory(provider.id)
    ? verdict("provider", true, `Provider "${provider.id}" resolves to a factory.`)
    : verdict(
        "provider",
        false,
        `No factory is registered for provider "${provider.id}". Supported providers: ${PROVIDER_IDS.join(", ")}.`,
      );
}

function isEnvVarSet(name: string): boolean {
  const value = process.env[name];
  return value !== undefined && value.length > 0;
}

function envVarVerdict(name: string): DoctorCheck {
  return isEnvVarSet(name)
    ? verdict("api-key", true, `${name} is set.`)
    : verdict("api-key", false, `The ${name} environment variable is not set.`);
}

function checkOpenAiCompatibleKey(apiKeyEnvVar: string | undefined): DoctorCheck {
  if (apiKeyEnvVar === undefined) {
    return verdict(
      "api-key",
      true,
      `The openai-compatible provider needs no API key. Set ${OPENAI_COMPATIBLE_ENV_VAR} only if your server requires one, or name your own variable with provider.options.apiKeyEnvVar.`,
    );
  }
  return envVarVerdict(apiKeyEnvVar);
}

function checkApiKey(provider: ProviderConfig): DoctorCheck {
  if (!isMachineProvider(provider)) {
    return verdict(
      "api-key",
      true,
      "No API key is needed: machine translation is disabled by policy, so none is read.",
    );
  }
  return provider.id === "openai-compatible"
    ? checkOpenAiCompatibleKey(provider.options.apiKeyEnvVar)
    : envVarVerdict(PROVIDER_ENV[provider.id]);
}

function networkPolicyCheck(config: VerbatraConfig): DoctorCheck {
  const outcome = checkNetworkPolicy(config.provider, config.network, processEnvironment());
  return verdict("network-policy", outcome.passed, outcome.detail);
}

const NOT_PARSED_DETAIL =
  "Its contents were not checked, because the configured format resolves to no adapter.";

async function existenceOnlyVerdict(sourcePath: string, fs: SdkFs): Promise<DoctorCheck> {
  return (await fs.fileExists(sourcePath))
    ? verdict("source-file", true, `Found ${sourcePath}. ${NOT_PARSED_DETAIL}`)
    : verdict("source-file", false, `The source locale file was not found at ${sourcePath}.`);
}

async function parseSourceVerdict(
  config: VerbatraConfig,
  resolver: LocalePathResolver,
  fs: SdkFs,
  adapter: FormatAdapter,
  sourcePath: string,
): Promise<DoctorCheck> {
  const { resource } = await readSourceResource(config, resolver, fs, adapter);
  const count = resource.entries.size;
  return verdict(
    "source-file",
    true,
    `Read ${sourcePath} (${count} translatable ${count === 1 ? "key" : "keys"}).`,
  );
}

async function checkSourceFile(
  config: VerbatraConfig,
  cwd: string,
  fs: SdkFs,
  outcome: AdapterOutcome,
): Promise<DoctorCheck> {
  try {
    const resolver = createLocalePathResolver(cwd, config);
    const sourcePath = resolver.pathFor(config.sourceLocale);
    return outcome.kind === "resolved"
      ? await parseSourceVerdict(config, resolver, fs, outcome.adapter, sourcePath)
      : await existenceOnlyVerdict(sourcePath, fs);
  } catch (error) {
    return verdict("source-file", false, errorMessage(error));
  }
}

async function literalDoctor(input: DoctorInput, deps: DoctorDeps): Promise<DoctorResult> {
  const outcome = await loadForDoctor(input, deps);
  if (outcome.kind === "failed") {
    return toResult([
      verdict("config", false, outcome.detail),
      check("untranslated-literals", "skipped", SKIPPED_DETAIL),
    ]);
  }
  const { config, source } = outcome.loaded;
  const configCheck = verdict("config", true, configDetail(source));
  const lint = await lintLiterals(
    config,
    input.cwd ?? process.cwd(),
    deps.fs ?? defaultFs,
    input.onProgress,
  );
  if (lint.kind === "not-run") {
    return toResult([configCheck, verdict("untranslated-literals", false, lint.detail)]);
  }
  const literalCheck = verdict(
    "untranslated-literals",
    isCleanLiteralScan(lint.scan),
    describeLiteralScan(lint.scan),
  );
  return { ...toResult([configCheck, literalCheck]), literals: lint.scan };
}

/**
 * Validates a project's setup and spends nothing: no provider is constructed, no network request is
 * made, and no file is written. Run it before {@link translate} on a fresh project, or when a run
 * failed and you want the whole list of problems rather than the first one.
 *
 * A setup run reports the nine checks {@link DoctorResult.checks} lists. Six of them can fail: the
 * config loads and validates, the configured format resolves to an adapter, the configured
 * provider ID resolves to a factory, the environment variable that provider reads its API key from
 * is set, the network policy permits the provider's host, and the source locale file can be read.
 * The other three are informational and never fail. Every check runs even when an
 * earlier one failed, so one call reports every independent problem. The API key is checked by
 * variable name only: its value is never read, never returned, and never validated against a
 * provider.
 *
 * The source-file check reads and parses the file rather than only probing for its existence, so a
 * directory standing in for it, an empty file, and malformed content are all reported here rather
 * than surfacing later as a whole-run failure of {@link check} or {@link translate}. The failure
 * detail is the same message those entry points raise. When the configured format resolves to no
 * adapter there is nothing to parse with, so the check falls back to existence alone and says so.
 *
 * The `openai-compatible` provider is the one exception on the key check. It falls back to a
 * placeholder key, so a missing variable passes unless the config names its own variable through
 * `provider.options.apiKeyEnvVar`, which then has to be set.
 *
 * The `network-policy` check reports the effective network policy and the host the configured
 * provider connects to, and fails when the policy refuses that host, exactly as {@link translate}
 * would. It resolves no host name, so a name that only a DNS answer can classify passes here and
 * is checked before each request instead.
 *
 * The informational `plural-rules` check names the ICU and CLDR versions the runtime derives
 * each target language's plural categories from, and lists any target locale ICU has no plural
 * rules for.
 *
 * The informational `locale-codes` check names every configured locale code that is
 * valid but not in canonical BCP 47 form and suggests the canonical spelling. File names follow the
 * configured code, so nothing is renamed.
 *
 * The informational `locale-state` check reads the lock file, the translation
 * memory, and the provenance file, and names every locale they hold state for that the config does
 * not list, with what the next {@link translate} run will do about it.
 *
 * A config whose provider is `none` passes both the provider and the key check: its provider check
 * reports that machine translation is disabled by policy, and no key variable is looked at.
 *
 * A target locale file is not checked at all: a missing one is not a problem, because
 * {@link translate} creates it. The source locale file is checked, because every other entry point
 * fails on it.
 *
 * When the config cannot be loaded the eight config-dependent checks report `skipped` rather than a
 * verdict they could not reach, and {@link DoctorResult.ok} is false because the config check
 * itself failed.
 *
 * With `literals: true` it runs the untranslated-literal scan instead of the setup checks. The
 * source roots of the config's `extract` block are read, never written, and every string literal
 * or piece of JSX text that reads as user-facing text without going through a recognised
 * translation call is returned in {@link DoctorResult.literals} with its file, line, column, and
 * an excerpt of at most 80 characters. Literals held back by a `verbatra-ignore-next-line` or
 * `verbatra-ignore-line` comment, or by `extract.literals.ignore`, are returned under `suppressed`
 * rather than dropped. The check fails when anything was found or when a file could not be
 * scanned, so a partial scan is never reported as clean. No provider is constructed and no API key
 * environment variable is read.
 *
 * @param input - The working directory, an optional explicit config path, and whether to run the
 *   untranslated-literal scan instead of the setup checks.
 * @param deps - Optional adapter registry, file-system, and config-loader overrides.
 * @returns Every check with its verdict, and the project-wide `ok` verdict.
 *
 * @throws {@link SdkError} `CONFIG_NOT_FOUND`: an explicit `configPath` was given and no file
 * exists there. A config that is merely absent from the search is a failed check instead.
 *
 * @example
 * ```ts
 * import { doctor } from "@verbatra/sdk";
 *
 * const report = await doctor();
 * for (const check of report.checks) {
 *   console.log(`${check.status}: ${check.title} - ${check.detail}`);
 * }
 * process.exitCode = report.ok ? 0 : 1;
 * ```
 */
export async function doctor(
  input: DoctorInput = {},
  deps: DoctorDeps = {},
): Promise<DoctorResult> {
  if (input.literals === true) {
    return literalDoctor(input, deps);
  }
  const outcome = await loadForDoctor(input, deps);
  if (outcome.kind === "failed") {
    return toResult([
      verdict("config", false, outcome.detail),
      ...CONFIG_DEPENDENT_IDS.map((id) => check(id, "skipped", SKIPPED_DETAIL)),
    ]);
  }
  const { config, source } = outcome.loaded;
  const adapter = resolveAdapter(config, deps);
  const cwd = input.cwd ?? process.cwd();
  const fs = deps.fs ?? defaultFs;
  return toResult([
    verdict("config", true, configDetail(source)),
    checkAdapter(config, adapter),
    checkProvider(config.provider),
    checkApiKey(config.provider),
    networkPolicyCheck(config),
    await checkSourceFile(config, cwd, fs, adapter),
    verdict("plural-rules", true, describePluralRules(config.targetLocales)),
    verdict(
      "locale-codes",
      true,
      describeLocaleCodes([config.sourceLocale, ...config.targetLocales]),
    ),
    verdict("locale-state", true, await describeLocaleState(config, cwd, fs)),
  ]);
}
