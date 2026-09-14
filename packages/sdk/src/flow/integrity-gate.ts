import {
  assessValueDegeneracy,
  checkPlaceholders,
  type PlaceholderIntegrityResult,
  type TranslationEntry,
} from "@verbatra/core";
import type { FormatAdapter } from "@verbatra/format-adapters";

/**
 * Why a candidate translation was refused before it could be written. The same gate guards
 * {@link editEntry} and {@link retranslateEntry}, so a hand-typed value and a provider-produced one
 * are held to identical standards.
 *
 * A rejected value is never written to the locale file and never recorded in the lock-file, so the
 * previous translation stays intact.
 *
 * - `placeholder`: the candidate does not carry the same placeholders as the source, so
 *   interpolation would break at runtime. For the double-brace formats (i18next, ngx-translate, and
 *   YAML) this also covers a single-brace `{name}`-shaped token the candidate invented and the
 *   source never had, which is a fabrication whichever interpolation delimiters the project uses.
 * - `icu`: the candidate is not a valid ICU message under the configured format's adapter.
 * - `degenerate`: the candidate collapsed into runaway output rather than a translation. Two shapes
 *   are detected: the candidate is at least twelve times the length of a source of meaningful
 *   length, or a short unit repeats consecutively enough to dominate the value. An untranslated
 *   echo of the source is not degenerate by this rule; it surfaces as the `EQUALS_SOURCE` review
 *   reason instead, which flags rather than refuses.
 * - `empty`: the source has text but the candidate is blank, which would silently erase a string.
 */
export type IntegrityGateReason = "placeholder" | "icu" | "degenerate" | "empty";

export type IntegrityGateResult =
  | { readonly accepted: true; readonly integrity: PlaceholderIntegrityResult }
  | { readonly accepted: false; readonly reason: IntegrityGateReason };

export function gateCandidateValue(
  sourceEntry: TranslationEntry,
  candidateValue: string,
  adapter: FormatAdapter,
): IntegrityGateResult {
  const placeholderResult =
    adapter.comparePlaceholders?.(sourceEntry.value, candidateValue) ??
    checkPlaceholders(sourceEntry.placeholders, adapter.extractPlaceholders(candidateValue));
  if (!placeholderResult.matches) {
    return { accepted: false, reason: "placeholder" };
  }
  if (!adapter.validateMessage(candidateValue)) {
    return { accepted: false, reason: "icu" };
  }
  if (assessValueDegeneracy(sourceEntry.value, candidateValue).degenerate) {
    return { accepted: false, reason: "degenerate" };
  }
  if (sourceEntry.value.trim() !== "" && candidateValue.trim() === "") {
    return { accepted: false, reason: "empty" };
  }
  return { accepted: true, integrity: placeholderResult };
}
