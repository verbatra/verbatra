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
  type MachineProviderConfig,
  PROVIDER_IDS,
  type ProviderConfig,
} from "../config/provider-config.js";
import type { VerbatraConfig } from "../config/schema.js";
import { apiKeyHint, errorHint } from "../error-hints.js";
import { errorMessage, SdkError } from "../errors.js";
import { defaultFs, type SdkFs } from "../fs.js";
import { createLocalePathResolver, type LocalePathResolver } from "../locale-path/resolver.js";
import type { ScanProgressListener } from "../progress/types.js";
import { selectAdapter } from "../selection/select-adapter.js";
import { describeLiteralScan, isCleanLiteralScan, lintLiterals } from "./literal-lint.js";
import {
  assessProviderLocales,
  type LocaleCapabilityReport,
  unsupportedLocales,
} from "./locale-capabilities.js";
import { refreshLanguageTable } from "./locale-capabilities-live.js";
import { describeLocaleState } from "./locale-state-doctor.js";
import { checkNetworkPolicy } from "./network-doctor.js";
import { describePluralCompleteness } from "./plural-completeness-doctor.js";
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
 * - `plural-completeness`: informational, never fails. Reads the source and every target locale
 *   file and names each plural whose committed forms lack CLDR plural categories the target
 *   language uses, the same finding {@link check} reports in
 *   {@link LocaleCheckSummary.incompletePlurals}. It says when the format does not store plural
 *   forms by CLDR category, or when a file could not be read.
 * - `locale-codes`: informational, never fails. Names every configured locale code that is valid
 *   but not in canonical BCP 47 form, such as `zh-hant-tw` or the deprecated `iw`, with the
 *   canonical form `Intl.getCanonicalLocales` suggests for it.
 * - `locale-state`: informational, never fails. Names every locale that has state in the lock
 *   file, the translation memory, or the provenance file but is not configured, such as `pt_BR`
 *   left behind after the config respelled it `pt-BR`, says whether the next {@link translate} run
 *   carries it over to the configured spelling, and suggests removing it or respelling the
 *   configured locale otherwise.
 * - `locales`: the configured provider supports the source locale and every target locale, judged
 *   against the language table verbatra ships for a machine-translation provider (see
 *   {@link LocaleSupport}). It fails when a locale is `unsupported`, exactly the case
 *   {@link translate} refuses with `LOCALE_UNSUPPORTED_BY_PROVIDER`, and passes with warnings
 *   otherwise; the per-locale verdicts are in {@link DoctorResult.locales}. It is `skipped` for the
 *   provider `none`, which calls no provider.
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
  | "plural-completeness"
  | "locale-codes"
  | "locale-state"
  | "locales"
  | "untranslated-literals";

/**
 * The verdict on one {@link DoctorCheck}. `skipped` is reported for the checks that need a loaded
 * config when the `config` check itself failed, and for the `locales` check under the provider
 * `none`, where it does not apply, so a skipped check is never a problem of its own.
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
  /**
   * The next step that resolves a failed check: one short imperative sentence, such as "Set
   * GEMINI_API_KEY in the environment or in a .env file in the project directory.". Present only
   * when {@link DoctorCheck.status} is `fail`. Like `detail`, it names environment variables and
   * paths, never an API key value.
   */
  readonly fix?: string;
}

/** The result of {@link doctor}: every check that ran, and one project-wide verdict. */
export interface DoctorResult {
  /** True only when no check failed. This is the value a script should branch on. */
  readonly ok: boolean;
  /**
   * Every check that ran, always in the same order. A setup run has eleven entries, one per setup
   * check: `config`, `format-adapter`, `provider`, `api-key`, `network-policy`, `source-file`,
   * `plural-rules`, `plural-completeness`, `locale-codes`, `locale-state`, and `locales`. A literal
   * run ({@link DoctorInput.literals}) has exactly two: `config` and `untranslated-literals`.
   */
  readonly checks: readonly DoctorCheck[];
  /**
   * What the untranslated-literal scan found. Present only on a literal run whose scan actually
   * ran; absent when the config could not be loaded, no `extract` block is configured, the file
   * system cannot list directories, or the scan failed to start, each of which fails the
   * `untranslated-literals` check instead.
   */
  readonly literals?: LiteralScan;
  /**
   * What the configured provider supports for each configured locale: whether it can translate it,
   * the code it is sent as, glossary and formality support, and any warnings. Present on a setup
   * run whose config loaded and whose provider is not `none`; the `locales` check carries the
   * verdict.
   */
  readonly locales?: LocaleCapabilityReport;
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
   * `source-file`, `plural-rules`, `plural-completeness`, `locale-codes`, `locale-state`,
   * `locales`), so no API key environment variable is looked at and a run with no key set can pass.
   */
  readonly literals?: boolean;
  /**
   * Fetch the configured machine-translation provider's current language list before the `locales`
   * check, instead of judging against the table verbatra ships. It is the one doctor option that
   * sends a network request: to the provider's language list endpoint only (DeepL's
   * `/v3/languages`, Google Cloud Translation's `languages`), which uses no translation quota. The
   * request is sent only when the provider's API key variable is set and the network policy
   * permits the provider's host; otherwise, or when the request fails, the static table is used and
   * {@link LocaleCapabilityReport.live} says why. It does nothing for an LLM provider or `none`.
   * Ignored on a literal run. Defaults to false.
   */
  readonly live?: boolean;
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
  "plural-completeness": "Plural completeness",
  "locale-codes": "Locale codes",
  "locale-state": "Locale state",
  locales: "Locale support",
  "untranslated-literals": "Untranslated literals",
};

const CONFIG_DEPENDENT_IDS: readonly DoctorCheckId[] = [
  "format-adapter",
  "provider",
  "api-key",
  "network-policy",
  "source-file",
  "plural-rules",
  "plural-completeness",
  "locale-codes",
  "locale-state",
  "locales",
];

const CHECK_FIXES: Record<DoctorCheckId, string | undefined> = {
  config: "Fix the config the detail names, or run `verbatra init` to create one.",
  "format-adapter": "Set `format` in the config to a supported format.",
  provider: `Set \`provider.id\` in the config to a supported provider: ${PROVIDER_IDS.join(", ")}.`,
  "api-key": "Set the API key environment variable the detail names.",
  "network-policy":
    "Point the provider at a host the network policy permits, or add its host to `network.allowedHosts` or VERBATRA_NETWORK_ALLOWED_HOSTS; correct VERBATRA_NETWORK_POLICY or VERBATRA_NETWORK_ALLOWED_HOSTS if either holds an invalid value.",
  "source-file":
    "Create the source locale file, or fix `files.pattern` and `sourceLocale` in the config so they point at it.",
  "plural-rules": undefined,
  "plural-completeness": undefined,
  "locale-codes": undefined,
  "locale-state": undefined,
  locales:
    "Remove the unsupported locale from `targetLocales`, map it to a supported code in `provider.options.localeMap`, or choose a provider that supports it.",
  "untranslated-literals":
    "Wrap each reported literal in a translation call, or suppress it with a `verbatra-ignore-next-line` comment or `extract.literals.ignore`.",
};

const SKIPPED_DETAIL = "Not checked: the configuration could not be loaded.";

function check(
  id: DoctorCheckId,
  status: DoctorCheckStatus,
  detail: string,
  fix?: string,
): DoctorCheck {
  const base = { id, title: CHECK_TITLES[id], status, detail };
  const resolvedFix = status === "fail" ? (fix ?? CHECK_FIXES[id]) : undefined;
  return resolvedFix === undefined ? base : { ...base, fix: resolvedFix };
}

function verdict(id: DoctorCheckId, passed: boolean, detail: string, fix?: string): DoctorCheck {
  return check(id, passed ? "pass" : "fail", detail, fix);
}

function failure(id: DoctorCheckId, error: unknown): DoctorCheck {
  return verdict(id, false, errorMessage(error), errorHint(error));
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
  | { readonly kind: "failed"; readonly error: unknown };

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
    return { kind: "failed", error };
  }
}

function configDetail(source: ConfigSource): string {
  return source.kind === "override"
    ? "Validated the config supplied in memory."
    : `Loaded ${source.filepath}.`;
}

type AdapterOutcome =
  | { readonly kind: "resolved"; readonly adapter: FormatAdapter }
  | { readonly kind: "failed"; readonly error: unknown };

function resolveAdapter(config: VerbatraConfig, deps: DoctorDeps): AdapterOutcome {
  try {
    const adapter = selectAdapter(config.format, deps.adapterRegistry, deps.fs);
    return { kind: "resolved", adapter };
  } catch (error) {
    return { kind: "failed", error };
  }
}

function checkAdapter(config: VerbatraConfig, outcome: AdapterOutcome): DoctorCheck {
  return outcome.kind === "resolved"
    ? verdict("format-adapter", true, `Format "${config.format}" resolves to an adapter.`)
    : failure("format-adapter", outcome.error);
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
    : verdict("api-key", false, `The ${name} environment variable is not set.`, apiKeyHint(name));
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
    return failure("source-file", error);
  }
}

const LOCALES_NOT_APPLICABLE_DETAIL =
  'Not applicable: machine translation is disabled by policy (provider "none"), so no provider ' +
  "language support is checked.";

function countOf(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function describeListed(report: LocaleCapabilityReport): string {
  const tally = (support: string): number =>
    report.locales.filter((entry) => entry.support === support).length;
  const unsupported = unsupportedLocales(report);
  const verdict =
    unsupported.length === 0
      ? "no configured locale is unsupported"
      : `unsupported: ${unsupported.map((locale) => `"${locale}"`).join(", ")}`;
  return (
    `Provider "${report.provider}", language table of ${report.tableVersion} (${report.tableOrigin}): ` +
    `${tally("supported")} of ${report.locales.length} target locales supported, ` +
    `${tally("unverified")} unverified; ${verdict}.`
  );
}

function describeOpen(report: LocaleCapabilityReport): string {
  return `Provider "${report.provider}" is an LLM and accepts any locale (well-tested list of ${report.tableVersion}).`;
}

function describeLocales(report: LocaleCapabilityReport): string {
  const warnings =
    report.source.warnings.length +
    report.locales.reduce((total, entry) => total + entry.warnings.length, 0);
  const parts = [
    report.coverage === "open" ? describeOpen(report) : describeListed(report),
    ...(warnings > 0 ? [`${countOf(warnings, "warning")}.`] : []),
    ...(report.live !== undefined
      ? [`Live language list ${report.live.status}: ${report.live.detail}`]
      : []),
  ];
  return parts.join(" ");
}

interface LocalesOutcome {
  readonly check: DoctorCheck;
  readonly report?: LocaleCapabilityReport;
}

async function assessForDoctor(
  config: VerbatraConfig,
  provider: MachineProviderConfig,
  live: boolean,
): Promise<LocaleCapabilityReport> {
  if (!live) {
    return assessProviderLocales(config, provider, config.targetLocales);
  }
  const outcome = await refreshLanguageTable(provider, config.network, processEnvironment());
  return {
    ...assessProviderLocales(config, provider, config.targetLocales, outcome.table),
    live: outcome.refresh,
  };
}

async function checkLocales(config: VerbatraConfig, live: boolean): Promise<LocalesOutcome> {
  const provider = config.provider;
  if (!isMachineProvider(provider)) {
    return { check: check("locales", "skipped", LOCALES_NOT_APPLICABLE_DETAIL) };
  }
  if (!hasProviderFactory(provider.id)) {
    return {
      check: check(
        "locales",
        "skipped",
        `Not checked: provider "${provider.id}" is not a known provider.`,
      ),
    };
  }
  const report = await assessForDoctor(config, provider, live);
  return {
    check: verdict("locales", unsupportedLocales(report).length === 0, describeLocales(report)),
    report,
  };
}

async function literalDoctor(input: DoctorInput, deps: DoctorDeps): Promise<DoctorResult> {
  const outcome = await loadForDoctor(input, deps);
  if (outcome.kind === "failed") {
    return toResult([
      failure("config", outcome.error),
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
    return toResult([configCheck, verdict("untranslated-literals", false, lint.detail, lint.fix)]);
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
 * made unless {@link DoctorInput.live} asks for a provider's language list, and no file is written.
 * Run it before {@link translate} on a fresh project, or when a run failed and you want the whole
 * list of problems rather than the first one.
 *
 * A setup run reports the eleven checks {@link DoctorResult.checks} lists. Seven of them can fail:
 * the config loads and validates, the configured format resolves to an adapter, the configured
 * provider ID resolves to a factory, the environment variable that provider reads its API key from
 * is set, the network policy permits the provider's host, the source locale file can be read, and
 * the provider supports every configured locale. The other four are informational and never fail.
 * Every check runs even when an earlier one failed, so one call reports every independent problem.
 * The API key is checked by variable name only: its value is never returned and never validated
 * against a provider, and it is read only when {@link DoctorInput.live} sends it to the provider's
 * language list endpoint.
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
 * The informational `plural-completeness` check reads the source and every target locale file
 * and names each plural whose committed forms lack CLDR plural categories the target language
 * uses, such as a Polish Android `<plurals>` with only `one` and `other`. A file it cannot read is
 * named in its detail rather than failing the check.
 *
 * The informational `locale-codes` check names every configured locale code that is
 * valid but not in canonical BCP 47 form and suggests the canonical spelling. File names follow the
 * configured code, so nothing is renamed.
 *
 * The informational `locale-state` check reads the lock file, the translation
 * memory, and the provenance file, and names every locale they hold state for that the config does
 * not list, with what the next {@link translate} run will do about it.
 *
 * The `locales` check judges the source locale and every target locale against the configured
 * provider's language support, with the per-locale verdicts in {@link DoctorResult.locales}: the
 * code each locale is sent as (after `provider.options.localeMap`), whether the provider supports
 * it, and whether it can apply a glossary and a formality setting for it. A machine-translation
 * provider is judged against the dated table verbatra ships for it, so no request is made unless
 * {@link DoctorInput.live} asks for the provider's current list; an LLM provider accepts any
 * locale and only warns about a language outside its well-tested list. It fails on an
 * `unsupported` locale, the same one {@link translate} refuses, and reports a glossary or a tone
 * the provider cannot apply as a warning.
 *
 * A config whose provider is `none` passes both the provider and the key check: its provider check
 * reports that machine translation is disabled by policy, and no key variable is looked at.
 *
 * A missing target locale file is not a problem, because {@link translate} creates it; only the
 * `plural-completeness` check reads target files at all. The source locale file is checked, because every other entry point
 * fails on it.
 *
 * When the config cannot be loaded the ten config-dependent checks report `skipped` rather than a
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
 * @param input - The working directory, an optional explicit config path, whether to run the
 *   untranslated-literal scan instead of the setup checks, and whether to fetch the provider's live
 *   language list.
 * @param deps - Optional adapter registry, file-system, and config-loader overrides.
 * @returns Every check with its verdict, the project-wide `ok` verdict, and the per-locale
 *   provider support report.
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
      failure("config", outcome.error),
      ...CONFIG_DEPENDENT_IDS.map((id) => check(id, "skipped", SKIPPED_DETAIL)),
    ]);
  }
  const { config, source } = outcome.loaded;
  const adapter = resolveAdapter(config, deps);
  const cwd = input.cwd ?? process.cwd();
  const fs = deps.fs ?? defaultFs;
  const locales = await checkLocales(config, input.live === true);
  const result = toResult([
    verdict("config", true, configDetail(source)),
    checkAdapter(config, adapter),
    checkProvider(config.provider),
    checkApiKey(config.provider),
    networkPolicyCheck(config),
    await checkSourceFile(config, cwd, fs, adapter),
    verdict("plural-rules", true, describePluralRules(config.targetLocales)),
    verdict(
      "plural-completeness",
      true,
      await describePluralCompleteness(
        config,
        cwd,
        fs,
        adapter.kind === "resolved" ? adapter.adapter : undefined,
      ),
    ),
    verdict(
      "locale-codes",
      true,
      describeLocaleCodes([config.sourceLocale, ...config.targetLocales]),
    ),
    verdict("locale-state", true, await describeLocaleState(config, cwd, fs)),
    locales.check,
  ]);
  return locales.report === undefined ? result : { ...result, locales: locales.report };
}
