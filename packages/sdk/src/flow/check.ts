import {
  type FormatId,
  findInconsistentTranslations,
  type InconsistencyGroup,
  type InconsistentTranslationsOptions,
} from "@verbatra/core";
import {
  type AdapterRegistry,
  androidPluralCategoryOf,
  type FormatAdapter,
  gettextKeyContext,
  gettextKeyPluralIndex,
  pluralCategoryOf,
} from "@verbatra/format-adapters";
import type { VerbatraConfig } from "../config/schema.js";
import type { SdkFs } from "../fs.js";
import { type ProvenanceSummary, summarizeProvenance } from "../lock/key-provenance.js";
import {
  type CheckSensitiveSummary,
  scanProjectForSensitiveContent,
} from "../sensitive/check-scan.js";
import { diffLocalesWithSource, type LocaleDiffResult } from "./diff-locales.js";
import { findIncompletePlurals, type IncompletePlural } from "./plural-completeness.js";
import { reportedProtectedKeys } from "./protection.js";
import {
  type CheckQaSummary,
  createQaContext,
  type LocaleQaReport,
  type QaSeverity,
  qaLocale,
  totalQa,
} from "./qa-check.js";
import { machineClassValues } from "./review-scan.js";

/** One locale's counts in a {@link CheckSummary}. */
export interface LocaleCheckSummary {
  /** The target locale these counts describe. */
  readonly locale: string;
  /** Number of source keys with a non-blank value and no translation in this locale yet. */
  readonly missing: number;
  /**
   * Number of keys with a non-blank source value whose source text changed since the locale was
   * last translated.
   */
  readonly stale: number;
  /**
   * Number of keys with a non-blank source value whose translation still matches the source
   * recorded in the lock-file.
   */
  readonly upToDate: number;
  /** True when this locale has nothing missing and nothing stale. */
  readonly inSync: boolean;
  /**
   * Number of source keys whose value is empty or whitespace only, such as a key `extract` added
   * without a default. They are counted here and never in `missing`, `stale` or `upToDate`,
   * whatever the target or the lock-file holds, so the four counts add up to the source's keys.
   * There is nothing to translate yet, so they never make `inSync` false; a {@link translate} run
   * reports them with a `SOURCE_VALUE_EMPTY` notice. {@link check} always sets it; it is optional
   * only so a summary built by hand, such as a test double, can leave it out.
   */
  readonly emptySource?: number;
  /**
   * Counts by origin and review state over the keys this locale has a value for, read from the
   * provenance file. See {@link KeyProvenance} for what each origin means. Absent when that file is
   * corrupt or was written by a newer verbatra, since a report never fails over it.
   */
  readonly provenance?: ProvenanceSummary;
  /**
   * How many of the stale keys a {@link translate} run would leave alone under the config's
   * `humanEdits` and `pinnedKeys`, because a person wrote, imported, or changed their value, or
   * because they are pinned: the protected share of `stale`. A pinned key that is missing has no
   * value to protect yet and counts only as missing. They still count as stale, so `inSync` stays
   * false until a person resolves them. When the provenance file is corrupt or was written by a
   * newer verbatra, no origin can be read and only the pinned keys are counted.
   */
  readonly protected?: number;
  /**
   * Every plural whose committed forms in this locale lack CLDR plural categories the target
   * language uses, ordered by key; empty when every plural is complete. Checked for the formats
   * whose plural forms follow CLDR categories: `i18next-json`, `android-xml`, `apple-strings`
   * (`.stringsdict`), `apple-xcstrings`, and the ICU `plural` and `selectordinal` messages of
   * `next-intl-json` and `arb`. Always empty for every other format. A warning: it never changes
   * `inSync` or any count. See {@link IncompletePlural} for what counts. {@link check} always sets
   * it; it is optional only so a summary built by hand, such as a test double, can leave it out.
   */
  readonly incompletePlurals?: readonly IncompletePlural[];
  /**
   * Every source string this locale translates more than one way under different keys, present only
   * when {@link CheckInput.consistency} is true (an empty array then means the locale is
   * consistent). This is a report and nothing more: it never changes `inSync` or any count.
   */
  readonly inconsistencies?: readonly InconsistencyGroup[];
  /**
   * The quality check of every committed value in this locale, present only when
   * {@link CheckInput.qa} is true. It never changes `inSync` or any count; a CI gate reads the
   * project-wide {@link CheckSummary.qa} totals instead.
   */
  readonly qa?: LocaleQaReport;
  /**
   * The review gate's finding for this locale, present only when {@link CheckInput.requireReviewed}
   * is true. It never changes `inSync` or any count; a CI gate reads the project-wide
   * {@link CheckSummary.review} instead.
   */
  readonly review?: LocaleReviewReport;
}

/** One locale's part of the review gate, see {@link CheckInput.requireReviewed}. */
export interface LocaleReviewReport {
  /**
   * Every key whose current value has a {@link MachineClassOrigin} and is not approved, in source
   * order. Empty when the provenance file cannot be read, which
   * {@link CheckReviewSummary.code} reports instead.
   */
  readonly unreviewed: readonly string[];
}

/**
 * Why the review gate failed, stable across releases, so a CI script can branch on it.
 *
 * - `REVIEW_REQUIRED`: at least one machine-class value is not approved.
 * - `REVIEW_STATE_UNREADABLE`: the provenance file is corrupt or was written by a newer verbatra,
 *   so no review state can be read and the gate fails closed.
 */
export type CheckReviewCode = "REVIEW_REQUIRED" | "REVIEW_STATE_UNREADABLE";

/** The project-wide review gate, see {@link CheckInput.requireReviewed}. */
export interface CheckReviewSummary {
  /** True when every machine-class value in every reported locale is approved. The gate's verdict. */
  readonly reviewed: boolean;
  /** How many machine-class values are not approved, summed across the reported locales. */
  readonly unreviewed: number;
  /** Why the gate failed. Present exactly when {@link CheckReviewSummary.reviewed} is false. */
  readonly code?: CheckReviewCode;
}

/** The result of {@link check}: per-locale counts plus one project-wide verdict. */
export interface CheckSummary {
  /** True only when every reported locale is in sync. This is the value a CI gate should assert on. */
  readonly inSync: boolean;
  /** Per-locale counts, in configured target order. */
  readonly locales: readonly LocaleCheckSummary[];
  /**
   * Quality-check totals across every reported locale, present only when {@link CheckInput.qa} is
   * true. A CI gate that runs the quality check fails the build when `errors` is above zero, and,
   * in a strict mode, when `warnings` is too.
   */
  readonly qa?: CheckQaSummary;
  /**
   * The review gate's verdict, present only when {@link CheckInput.requireReviewed} is true. A CI
   * gate fails the build when `reviewed` is false.
   */
  readonly review?: CheckReviewSummary;
  /**
   * The sensitive-content scan, present only when {@link CheckInput.sensitive} is true. A CI gate
   * fails the build when it holds any finding or glossary term.
   */
  readonly sensitive?: CheckSensitiveSummary;
}

/** Input for {@link check}. */
export interface CheckInput {
  /** The resolved project config, normally from {@link loadConfig}. */
  readonly config: VerbatraConfig;
  /** Directory the `files.pattern` is resolved against. Defaults to the project root of the config object {@link loadConfig} returned, else the process working directory; a copied or rebuilt config loses that root, so pass `cwd` from {@link resolveProjectRoot}. */
  readonly cwd?: string;
  /** Restrict the report to these target locales. Defaults to every configured target locale. */
  readonly locales?: readonly string[];
  /**
   * Also report, per locale, every source string translated more than one way under different keys
   * (see {@link LocaleCheckSummary.inconsistencies}). Defaults to false.
   */
  readonly consistency?: boolean;
  /**
   * Also run the quality check over every committed value (see {@link LocaleCheckSummary.qa}):
   * the write-time integrity gate, whose refusals are reported as errors, and the review reasons
   * a translation run computes, reported as warnings. Keyless: no provider is called and nothing is
   * written. Defaults to false.
   */
  readonly qa?: boolean;
  /**
   * The lowest severity the quality check reports. `error` skips the review reasons entirely, so
   * only integrity failures are reported. Ignored unless {@link CheckInput.qa} is true. Defaults to
   * `warning`.
   */
  readonly qaSeverity?: QaSeverity;
  /**
   * Also run the review gate (see {@link CheckSummary.review}): every value written by a
   * machine-class path (see {@link MACHINE_CLASS_ORIGINS}) must be approved in the provenance file.
   * A value a person wrote, imported, or edited outside verbatra needs no approval, and neither
   * does one with no provenance record. An approval given against a source text that has changed
   * since does not count. Keyless: no provider is called and nothing is written. Defaults to false.
   */
  readonly requireReviewed?: boolean;
  /**
   * Also scan the source file and the glossary of every reported locale for content that looks
   * sensitive (see {@link CheckSummary.sensitive}), with the config's `sensitiveData` detectors,
   * patterns and allow list, or the default detectors when the block is absent. It scans every
   * field a language model would receive, whatever the configured provider and
   * `sensitiveData.mode`.
   * Keyless: no provider is called and nothing is written. Defaults to false.
   */
  readonly sensitive?: boolean;
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
  config: VerbatraConfig,
  result: LocaleDiffResult,
  consistency: InconsistentTranslationsOptions | undefined,
  qa: LocaleQaReport | undefined,
  review: LocaleReviewReport | undefined,
): LocaleCheckSummary {
  const { locale, diff, source, target, provenance } = result;
  return {
    locale,
    missing: diff.missing.length,
    stale: diff.changed.length,
    upToDate: diff.unchanged.length,
    emptySource: diff.emptySource.length,
    inSync: diff.missing.length === 0 && diff.changed.length === 0,
    ...(provenance !== undefined
      ? { provenance: summarizeProvenance(provenance, source, target) }
      : {}),
    protected: presentProtectedKeys(config, result).length,
    incompletePlurals: findIncompletePlurals(config.format, source, target, locale),
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
    ...(qa !== undefined ? { qa } : {}),
    ...(review !== undefined ? { review } : {}),
  };
}

function reviewReport(result: LocaleDiffResult): LocaleReviewReport {
  const records = result.provenance;
  if (records === undefined) {
    return { unreviewed: [] };
  }
  return {
    unreviewed: machineClassValues(result, records)
      .filter((value) => value.provenance.reviewState !== "approved")
      .map((value) => value.key),
  };
}

function reviewSummary(
  results: readonly LocaleDiffResult[],
  reports: readonly LocaleReviewReport[],
): CheckReviewSummary {
  const unreviewed = reports.reduce((sum, report) => sum + report.unreviewed.length, 0);
  if (results.some((result) => result.provenance === undefined)) {
    return { reviewed: false, unreviewed, code: "REVIEW_STATE_UNREADABLE" };
  }
  return unreviewed === 0
    ? { reviewed: true, unreviewed }
    : { reviewed: false, unreviewed, code: "REVIEW_REQUIRED" };
}

function presentProtectedKeys(config: VerbatraConfig, result: LocaleDiffResult): readonly string[] {
  const stale = new Set(result.diff.changed);
  return reportedProtectedKeys(config, result).filter((key) => stale.has(key));
}

function qaReports(
  input: CheckInput,
  adapter: FormatAdapter,
  sourceInvalidIcuKeys: readonly string[],
  results: readonly LocaleDiffResult[],
): readonly LocaleQaReport[] | undefined {
  if (input.qa !== true) {
    return undefined;
  }
  const context = createQaContext(
    input.config,
    adapter,
    input.qaSeverity ?? "warning",
    sourceInvalidIcuKeys,
  );
  return results.map((result) => qaLocale(context, result.locale, result.source, result.target));
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
 * State the lock-file and provenance file still record under an underscore spelling of a configured
 * locale (`pt_BR` for `pt-BR`) is read as that locale's, the same way {@link translate} carries it
 * over, so a respelled locale reports the keys a run would retranslate. Nothing is moved or written.
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
 * Every locale also lists, in {@link LocaleCheckSummary.incompletePlurals}, each plural whose
 * committed forms lack CLDR plural categories the target language uses, such as a Polish Android
 * `<plurals>` with only `one` and `other`. This is a warning and never changes `inSync`.
 *
 * With {@link CheckInput.requireReviewed} set, each locale also lists the machine-class values
 * nobody has approved, and {@link CheckSummary.review} carries the verdict a CI gate fails on. The
 * provenance file is committed, so the gate sees the same decisions on every machine. A provenance
 * file that cannot be read fails the gate with `REVIEW_STATE_UNREADABLE` rather than the call.
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
 * @throws `AdapterError`: the adapter refused a target locale file because it is malformed. Its
 * own code is preserved rather than remapped onto an {@link SdkErrorCode}.
 */
export async function check(input: CheckInput, deps: CheckDeps = {}): Promise<CheckSummary> {
  const { results, adapter, source, sourceInvalidIcuKeys } = await diffLocalesWithSource(
    input,
    deps,
  );
  const consistency =
    input.consistency === true ? consistencyOptions(input.config.format) : undefined;
  const qa = qaReports(input, adapter, sourceInvalidIcuKeys, results);
  const review = input.requireReviewed === true ? results.map(reviewReport) : undefined;
  const locales = results.map((result, index) =>
    toCheckSummary(input.config, result, consistency, qa?.[index], review?.[index]),
  );
  return {
    inSync: locales.every((entry) => entry.inSync),
    locales,
    ...(qa !== undefined ? { qa: totalQa(qa, sourceInvalidIcuKeys) } : {}),
    ...(review !== undefined ? { review: reviewSummary(results, review) } : {}),
    ...(input.sensitive === true
      ? {
          sensitive: scanProjectForSensitiveContent(
            input.config,
            source,
            results.map((result) => result.locale),
          ),
        }
      : {}),
  };
}
