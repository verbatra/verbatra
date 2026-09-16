import { OPENAI_COMPATIBLE_ENV_VAR, PROVIDER_ENV } from "@verbatra/ai-providers";
import type { LiteralScan } from "@verbatra/extract";
import type { AdapterRegistry, FormatAdapter } from "@verbatra/format-adapters";
import {
  type ConfigSource,
  type LoadConfigOptions,
  type LoadedConfig,
  loadConfigWithMeta,
} from "../config/load-config.js";
import {
  hasProviderFactory,
  PROVIDER_IDS,
  type ProviderConfig,
} from "../config/provider-config.js";
import type { VerbatraConfig } from "../config/schema.js";
import { errorMessage, SdkError } from "../errors.js";
import { defaultFs, type SdkFs } from "../fs.js";
import { createLocalePathResolver, type LocalePathResolver } from "../locale-path/resolver.js";
import { selectAdapter } from "../selection/select-adapter.js";
import { describeLiteralScan, isCleanLiteralScan, lintLiterals } from "./literal-lint.js";
import { readSourceResource } from "./source.js";

/**
 * Which project-setup question a {@link DoctorCheck} answers.
 *
 * - `config`: a config file was found and passes validation.
 * - `format-adapter`: the configured `format` resolves to a file adapter.
 * - `provider`: the configured `provider.id` resolves to a provider factory.
 * - `api-key`: the environment variable the configured provider reads its key from is set.
 * - `source-file`: the source locale file exists at its resolved path, is a regular file, and
 *   parses under the configured format.
 * - `untranslated-literals`: the application source configured in the `extract` block holds no
 *   hardcoded user-facing string literal and no file the scan could not read. It runs only when
 *   {@link DoctorInput.literals} is set.
 */
export type DoctorCheckId =
  | "config"
  | "format-adapter"
  | "provider"
  | "api-key"
  | "source-file"
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
   * Every check that ran, always in the same order. A setup run has one entry per setup check:
   * `config`, `format-adapter`, `provider`, `api-key`, and `source-file`. A literal run
   * ({@link DoctorInput.literals}) has exactly two: `config` and `untranslated-literals`.
   */
  readonly checks: readonly DoctorCheck[];
  /**
   * What the untranslated-literal scan found. Present only on a literal run whose scan actually
   * ran; absent when the config could not be loaded, no `extract` block is configured, or the
   * file system cannot list directories.
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
   * source roots of its `extract` block are scanned for hardcoded user-facing string literals. The
   * provider, API-key, format, and source-file checks do not run, so no API key environment
   * variable is looked at and a run with no key set can pass.
   */
  readonly literals?: boolean;
}

/** Injectable dependencies for {@link doctor}. Every field has a working default. */
export interface DoctorDeps {
  /** Format-adapter registry to resolve the configured format against. Defaults to the built-in registry. */
  readonly adapterRegistry?: AdapterRegistry;
  /**
   * File-system port. Threaded into the config loader, so it backs the glossary-file read the
   * `config` check performs, and used to read and parse the source locale file. Defaults to the
   * real file system.
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
  "source-file": "Source locale file",
  "untranslated-literals": "Untranslated literals",
};

const CONFIG_DEPENDENT_IDS: readonly DoctorCheckId[] = [
  "format-adapter",
  "provider",
  "api-key",
  "source-file",
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

function checkProvider(provider: ProviderConfig): DoctorCheck {
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
  return provider.id === "openai-compatible"
    ? checkOpenAiCompatibleKey(provider.options.apiKeyEnvVar)
    : envVarVerdict(PROVIDER_ENV[provider.id]);
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
  const lint = await lintLiterals(config, input.cwd ?? process.cwd(), deps.fs ?? defaultFs);
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
 * Five checks run: the config loads and validates, the configured format resolves to an adapter,
 * the configured provider ID resolves to a factory, the environment variable that provider reads
 * its API key from is set, and the source locale file can be read. Every check runs even when an
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
 * A target locale file is not checked at all: a missing one is not a problem, because
 * {@link translate} creates it. The source locale file is checked, because every other entry point
 * fails on it.
 *
 * When the config cannot be loaded the four config-dependent checks report `skipped` rather than a
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
  return toResult([
    verdict("config", true, configDetail(source)),
    checkAdapter(config, adapter),
    checkProvider(config.provider),
    checkApiKey(config.provider),
    await checkSourceFile(config, input.cwd ?? process.cwd(), deps.fs ?? defaultFs, adapter),
  ]);
}
