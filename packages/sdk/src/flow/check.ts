import {
  type FormatId,
  findInconsistentTranslations,
  type InconsistencyGroup,
  type InconsistentTranslationsOptions,
} from "@verbatra/core";
import {
  type AdapterRegistry,
  androidPluralCategoryOf,
  gettextKeyContext,
  gettextKeyPluralIndex,
  pluralCategoryOf,
} from "@verbatra/format-adapters";
import type { VerbatraConfig } from "../config/schema.js";
import type { SdkFs } from "../fs.js";
import { diffLocales, type LocaleDiffResult } from "./diff-locales.js";

/** One locale's counts in a {@link CheckSummary}. */
export interface LocaleCheckSummary {
  /** The target locale these counts describe. */
  readonly locale: string;
  /** Number of source keys with no translation in this locale yet. */
  readonly missing: number;
  /** Number of keys whose source text changed since the locale was last translated. */
  readonly stale: number;
  /** Number of keys whose translation still matches the source recorded in the lock-file. */
  readonly upToDate: number;
  /** True when this locale has nothing missing and nothing stale. */
  readonly inSync: boolean;
  /**
   * Every source string this locale translates more than one way under different keys, present only
   * when {@link CheckInput.consistency} is true (an empty array then means the locale is
   * consistent). This is a report and nothing more: it never changes `inSync` or any count.
   */
  readonly inconsistencies?: readonly InconsistencyGroup[];
}

/** The result of {@link check}: per-locale counts plus one project-wide verdict. */
export interface CheckSummary {
  /** True only when every reported locale is in sync. This is the value a CI gate should assert on. */
  readonly inSync: boolean;
  /** Per-locale counts, in configured target order. */
  readonly locales: readonly LocaleCheckSummary[];
}

/** Input for {@link check}. */
export interface CheckInput {
  /** The resolved project config, normally from {@link loadConfig}. */
  readonly config: VerbatraConfig;
  /** Directory the `files.pattern` is resolved against. Defaults to the process working directory. */
  readonly cwd?: string;
  /** Restrict the report to these target locales. Defaults to every configured target locale. */
  readonly locales?: readonly string[];
  /**
   * Also report, per locale, every source string translated more than one way under different keys
   * (see {@link LocaleCheckSummary.inconsistencies}). Defaults to false.
   */
  readonly consistency?: boolean;
}

/** Injectable dependencies for {@link check}. Every field has a working default. */
export interface CheckDeps {
  /** Format-adapter registry to resolve the configured format. Defaults to the built-in registry. */
  readonly adapterRegistry?: AdapterRegistry;
  /** File-system port. Defaults to the real file system. */
  readonly fs?: SdkFs;
}

const suffixPluralForms: InconsistentTranslationsOptions = { pluralFormOf: pluralCategoryOf };

const CONSISTENCY_OPTIONS: ReadonlyMap<FormatId, InconsistentTranslationsOptions> = new Map([
  ["i18next-json", suffixPluralForms],
  ["apple-strings", suffixPluralForms],
  ["apple-xcstrings", suffixPluralForms],
  ["android-xml", { pluralFormOf: androidPluralCategoryOf }],
  [
    "gettext-po",
    {
      contextOf: gettextKeyContext,
      pluralFormOf: (key: string) => gettextKeyPluralIndex(key)?.toString(),
    },
  ],
]);

function consistencyOptions(format: FormatId): InconsistentTranslationsOptions {
  return CONSISTENCY_OPTIONS.get(format) ?? {};
}

function toCheckSummary(
  { locale, diff, source, target }: LocaleDiffResult,
  consistency: InconsistentTranslationsOptions | undefined,
): LocaleCheckSummary {
  return {
    locale,
    missing: diff.missing.length,
    stale: diff.changed.length,
    upToDate: diff.unchanged.length,
    inSync: diff.missing.length === 0 && diff.changed.length === 0,
    ...(consistency !== undefined
      ? {
          inconsistencies: findInconsistentTranslations(
            source,
            target,
            diff.unchanged,
            consistency,
          ),
        }
      : {}),
  };
}

/**
 * Reports whether every target locale is up to date, without writing anything and without calling
 * the provider. This is the CI gate: run it on a pull request and fail the build when
 * {@link CheckSummary.inSync} is false.
 *
 * Staleness is judged against the lock-file baseline, not against the target file's mere existence,
 * so a key whose source text changed after it was translated counts as stale even though a
 * translation is present. A locale file that does not exist yet is treated as empty rather than as
 * an error, so a newly added locale reports every key as missing.
 *
 * Use {@link diff} instead when you need the key names rather than the counts.
 *
 * With {@link CheckInput.consistency} set, each locale also lists the source strings it translates
 * more than one way under different keys. Only keys that are up to date are compared, since a stale
 * translation belongs to an older source text. Values are compared after Unicode NFC normalization,
 * folding line endings, and trimming leading and trailing whitespace; internal whitespace and letter
 * case count. Keys whose description, meaning, plural flag, or gettext `msgctxt` differ are never
 * grouped, and neither are the different plural forms of one key: a format that stores each form
 * under its own key (i18next, Apple `.stringsdict` and `.xcstrings`, Android, gettext) is compared
 * per plural category or gettext `msgstr` index. The report never affects `inSync`, a count, or any
 * file, and a translation identical to its own source is not a finding here.
 *
 * Note that a malformed target locale file surfaces the adapter's own error and code rather than a
 * wrapped {@link SdkError}, because only source reads are wrapped. Its message names the offending
 * locale and the resolved path. A caller that maps SDK codes should be ready for an unrecognized
 * error from a target file.
 *
 * @param input - The config and the optional locale filter.
 * @param deps - Optional adapter registry and file-system overrides.
 * @returns Per-locale counts and the project-wide in-sync verdict.
 *
 * @throws {@link SdkError} `UNKNOWN_FORMAT`: no adapter is registered for the configured format.
 * @throws {@link SdkError} `LOCALE_LAYOUT_INVALID`: the `files.pattern` and `files.localeStyle`
 * cannot be combined, or a configured locale has no valid path spelling under that style.
 * @throws {@link SdkError} `LOCALE_PATH_COLLISION`: two configured locales resolve to the same path.
 * @throws {@link SdkError} `SOURCE_UNREADABLE`: the source locale file does not exist.
 * @throws {@link SdkError} `SOURCE_INVALID`: the source locale file could not be parsed.
 * @throws {@link SdkError} `LOCK_FILE_INVALID`: the lock-file is corrupt, oversized, or at an
 * unsupported version.
 * @throws {@link SdkError} `UNKNOWN_LOCALE`: a requested locale is not a configured target locale.
 */
export async function check(input: CheckInput, deps: CheckDeps = {}): Promise<CheckSummary> {
  const results = await diffLocales(input, deps);
  const consistency =
    input.consistency === true ? consistencyOptions(input.config.format) : undefined;
  const locales = results.map((result) => toCheckSummary(result, consistency));
  return { inSync: locales.every((entry) => entry.inSync), locales };
}
