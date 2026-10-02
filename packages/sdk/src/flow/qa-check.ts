import { computeReviewFlags, type ReviewReasonCode } from "@verbatra/ai-providers";
import type { LocaleResource, TranslationEntry } from "@verbatra/core";
import type { FormatAdapter } from "@verbatra/format-adapters";
import { glossaryForLocale } from "../config/glossary.js";
import { toMaxLengthMap } from "../config/max-length.js";
import type { VerbatraConfig } from "../config/schema.js";
import {
  droppedForeignPlaceholders,
  withDroppedPlaceholderReason,
} from "./foreign-placeholders.js";
import { gateCandidateValue, type IntegrityGateReason } from "./integrity-gate.js";
import { planPluralGeneration } from "./plural-categories.js";

/**
 * The two severities of a quality-check finding, lowest last. An `error` is a value the
 * write-time integrity gate would refuse; a `warning` is a review reason a translation run would
 * flag for a person to look at. This tuple is the single source of truth for the set.
 */
export const QA_SEVERITIES = ["error", "warning"] as const;

/** One of {@link QA_SEVERITIES}. */
export type QaSeverity = (typeof QA_SEVERITIES)[number];

/**
 * A committed translation the write-time integrity gate would refuse: a broken or invented
 * placeholder, broken or changed inline markup, an invalid ICU message or ICU arms that do not
 * fit the target language, runaway output, or a blank value for a source that has text.
 */
export interface QaIntegrityFinding {
  /** The key whose committed value fails the check. */
  readonly key: string;
  /** Always `error`: a value like this would never be written by verbatra. */
  readonly severity: "error";
  /** The first gate check the value fails, one of {@link INTEGRITY_GATE_REASONS}. */
  readonly reason: IntegrityGateReason;
  /**
   * What is wrong, when the check can name it: for `placeholder`, each placeholder the value
   * drops prefixed with `-` and each one it adds prefixed with `+`; for `markup`, the offending
   * tags in the same notation; for `icu`, each wrong plural, ordinal, or select arm. Absent when
   * no single part is at fault.
   */
  readonly details?: readonly string[];
}

/**
 * A committed translation that passes the integrity gate but carries a review reason: a length
 * far from the source's, a value over its `maxLength` budget, an untranslated copy of the source, a
 * glossary term the value does not use, placeholders in a different order, or a placeholder of
 * another syntax than the project's format that the value dropped or changed.
 */
export interface QaReviewFinding {
  /** The key whose committed value is flagged. */
  readonly key: string;
  /** Always `warning`: the value is safe to ship but worth a look. */
  readonly severity: "warning";
  /** The review reason, one of the {@link REVIEW_REASON_CODES} computed from the two values alone. */
  readonly reason: ReviewReasonCode;
  /**
   * What is behind a `FOREIGN_PLACEHOLDER_CHANGED` warning: each placeholder of another syntax
   * than the project's format that the value dropped or changed, prefixed with `-`, the notation a
   * `placeholder` error uses. Absent for every other reason.
   */
  readonly details?: readonly string[];
}

/** One finding of a quality check, told apart by its `severity`. */
export type QaFinding = QaIntegrityFinding | QaReviewFinding;

/** One locale's quality-check result in a {@link LocaleCheckSummary}. */
export interface LocaleQaReport {
  /**
   * How many committed values were checked: every value this locale holds for a source key, plus,
   * for i18next, every plural form the target language needs beyond the source's. Keys only the
   * target has are not checked, nor are keys listed in {@link CheckQaSummary.invalidSourceKeys}.
   */
  readonly checked: number;
  /** How many findings have severity `error`. */
  readonly errors: number;
  /** How many findings have severity `warning`. */
  readonly warnings: number;
  /**
   * Every finding, ordered by key. A value the gate refuses carries exactly one error and no
   * warnings, since review reasons are only computed for a value that passes the gate.
   */
  readonly findings: readonly QaFinding[];
}

/** The project-wide quality-check totals in a {@link CheckSummary}. */
export interface CheckQaSummary {
  /** Findings of severity `error` across every reported locale. */
  readonly errors: number;
  /** Findings of severity `warning` across every reported locale. */
  readonly warnings: number;
  /**
   * Source keys whose own value is not a valid ICU message. No target value can be judged
   * against such a source, so these keys are skipped in every locale until the source is fixed.
   */
  readonly invalidSourceKeys: readonly string[];
}

export interface QaContext {
  readonly config: VerbatraConfig;
  readonly adapter: FormatAdapter;
  readonly severity: QaSeverity;
  readonly invalidSourceKeys: ReadonlySet<string>;
  readonly maxLength: ReadonlyMap<string, number> | undefined;
}

interface QaPair {
  readonly key: string;
  readonly sourceEntry: TranslationEntry;
  readonly value: string;
}

export function createQaContext(
  config: VerbatraConfig,
  adapter: FormatAdapter,
  severity: QaSeverity,
  invalidSourceKeys: readonly string[],
): QaContext {
  return {
    config,
    adapter,
    severity,
    invalidSourceKeys: new Set(invalidSourceKeys),
    maxLength: toMaxLengthMap(config.maxLength),
  };
}

function directPairs(context: QaContext, source: LocaleResource, target: LocaleResource): QaPair[] {
  const pairs: QaPair[] = [];
  for (const [key, sourceEntry] of source.entries) {
    const value = target.entries.get(key)?.value;
    if (value !== undefined && !context.invalidSourceKeys.has(key)) {
      pairs.push({ key, sourceEntry, value });
    }
  }
  return pairs;
}

function addedPluralFormPairs(
  context: QaContext,
  source: LocaleResource,
  target: LocaleResource,
  locale: string,
): QaPair[] {
  const pairs: QaPair[] = [];
  for (const item of planPluralGeneration(source, locale, context.config.format).items) {
    const value = target.entries.get(item.targetKey)?.value;
    if (value !== undefined) {
      pairs.push({ key: item.targetKey, sourceEntry: item.sourceEntry, value });
    }
  }
  return pairs;
}

function integrityFinding(
  key: string,
  reason: IntegrityGateReason,
  details: readonly string[] | undefined,
): QaIntegrityFinding {
  return details !== undefined && details.length > 0
    ? { key, severity: "error", reason, details }
    : { key, severity: "error", reason };
}

function findingsFor(context: QaContext, locale: string, pair: QaPair): readonly QaFinding[] {
  const gate = gateCandidateValue(pair.sourceEntry, pair.value, context.adapter, locale);
  if (!gate.accepted) {
    return [integrityFinding(pair.key, gate.reason, gate.details)];
  }
  if (context.severity === "error") {
    return [];
  }
  const flag = computeReviewFlags({
    sourceValue: pair.sourceEntry.value,
    translatedValue: pair.value,
    sourceLocale: context.config.sourceLocale,
    targetLocale: locale,
    integrity: gate.integrity,
    glossary: glossaryForLocale(context.config.glossary, locale),
    maxLength: context.maxLength?.get(pair.sourceEntry.key),
  });
  const dropped = droppedForeignPlaceholders(
    context.adapter.format,
    pair.sourceEntry.value,
    pair.value,
  );
  const reasons = withDroppedPlaceholderReason(flag, dropped)?.reasons ?? [];
  return reasons.map((reason) => reviewFinding(pair.key, reason, dropped));
}

function reviewFinding(
  key: string,
  reason: ReviewReasonCode,
  dropped: readonly string[],
): QaReviewFinding {
  return reason === "FOREIGN_PLACEHOLDER_CHANGED"
    ? { key, severity: "warning", reason, details: dropped.map((token) => `-${token}`) }
    : { key, severity: "warning", reason };
}

function byKey(a: QaPair, b: QaPair): number {
  return a.key.localeCompare(b.key);
}

export function qaLocale(
  context: QaContext,
  locale: string,
  source: LocaleResource,
  target: LocaleResource,
): LocaleQaReport {
  const pairs = [
    ...directPairs(context, source, target),
    ...addedPluralFormPairs(context, source, target, locale),
  ].sort(byKey);
  const findings = pairs.flatMap((pair) => findingsFor(context, locale, pair));
  const errors = findings.filter((finding) => finding.severity === "error").length;
  return { checked: pairs.length, errors, warnings: findings.length - errors, findings };
}

export function totalQa(
  reports: readonly Pick<LocaleQaReport, "errors" | "warnings">[],
  invalidSourceKeys: readonly string[],
): CheckQaSummary {
  let errors = 0;
  let warnings = 0;
  for (const report of reports) {
    errors += report.errors;
    warnings += report.warnings;
  }
  return { errors, warnings, invalidSourceKeys: [...invalidSourceKeys].sort() };
}
