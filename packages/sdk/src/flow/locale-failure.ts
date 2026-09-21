import { describeError } from "../errors.js";
import type { FuzzyCacheHit, LocaleSummary } from "./summary.js";

export function failureSummary(locale: string, error: unknown): LocaleSummary {
  return {
    locale,
    status: "failed",
    translated: [],
    unchanged: [],
    orphaned: [],
    pruned: [],
    invalidIcuSource: [],
    cacheHits: [],
    fuzzyHits: [],
    integrityMismatches: [],
    providerFailures: [],
    budgetWithheld: [],
    generated: [],
    notices: [],
    needsReview: [],
    unfilled: [],
    malformedRows: [],
    duplicateKeys: [],
    error: describeError(error, "LOCALE_FAILED"),
  };
}

export interface LocaleStatusParts {
  readonly translated: readonly string[];
  readonly cacheHits: readonly string[];
  readonly fuzzyHits: readonly FuzzyCacheHit[];
  readonly generated: readonly string[];
  readonly integrityMismatches: readonly string[];
  readonly providerFailures: readonly string[];
  readonly budgetWithheld: readonly string[];
}

export function deriveLocaleStatus(parts: LocaleStatusParts): LocaleSummary["status"] {
  const withheld =
    parts.integrityMismatches.length > 0 ||
    parts.providerFailures.length > 0 ||
    parts.budgetWithheld.length > 0;
  if (!withheld) {
    return "succeeded";
  }
  const accepted =
    parts.translated.length > 0 ||
    parts.cacheHits.length > 0 ||
    parts.fuzzyHits.length > 0 ||
    parts.generated.length > 0;
  return accepted ? "partial" : "failed";
}

export function partition(locales: readonly LocaleSummary[]): {
  succeeded: readonly string[];
  partial: readonly string[];
  failed: readonly string[];
} {
  const namesWith = (status: LocaleSummary["status"]): readonly string[] =>
    locales.filter((s) => s.status === status).map((s) => s.locale);
  return {
    succeeded: namesWith("succeeded"),
    partial: namesWith("partial"),
    failed: namesWith("failed"),
  };
}
