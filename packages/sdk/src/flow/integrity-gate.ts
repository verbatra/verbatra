import {
  assessValueDegeneracy,
  checkPlaceholders,
  compareInlineMarkup,
  type PlaceholderIntegrityResult,
  type TranslationEntry,
} from "@verbatra/core";
import type { FormatAdapter } from "@verbatra/format-adapters";

/**
 * Every reason a candidate translation can be refused before it is written. The same gate guards
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
 * - `markup`: the candidate does not carry the same inline HTML or XML tags as the source, or it
 *   carries them unbalanced or mis-nested, either of which breaks the rendering of the string the
 *   way a dropped placeholder breaks its interpolation. Tags are compared as a multiset of names
 *   plus attribute names, so a different word order and a translated attribute value are both
 *   accepted. The check is silent unless the source's own markup is well formed, and it never
 *   applies to a format whose adapter already reports its inline markup as placeholders (XLIFF),
 *   which the `placeholder` reason covers instead.
 * - `icu`: the candidate is not a valid ICU message under the configured format's adapter.
 * - `degenerate`: the candidate collapsed into runaway output rather than a translation. Two shapes
 *   are detected: the candidate is at least twelve times the length of a source of meaningful
 *   length, or a short unit repeats consecutively enough to dominate the value. An untranslated
 *   echo of the source is not degenerate by this rule; it surfaces as the `EQUALS_SOURCE` review
 *   reason instead, which flags rather than refuses.
 * - `empty`: the source has text but the candidate is blank, which would silently erase a string.
 *
 * This tuple is the single source of truth for the set. {@link IntegrityGateReason} is derived from
 * it, so build any runtime validator or exhaustive lookup from this value rather than retyping the
 * members; a hand-copied list silently falls behind the next addition.
 *
 * @example
 * ```ts
 * import { INTEGRITY_GATE_REASONS } from "@verbatra/sdk";
 * import { z } from "zod";
 *
 * const reasonSchema = z.enum(INTEGRITY_GATE_REASONS);
 * ```
 */
export const INTEGRITY_GATE_REASONS = [
  "placeholder",
  "markup",
  "icu",
  "degenerate",
  "empty",
] as const;

/**
 * One of {@link INTEGRITY_GATE_REASONS}. The union is derived from that tuple rather than written
 * out again, so a reason can only be added in one place.
 */
export type IntegrityGateReason = (typeof INTEGRITY_GATE_REASONS)[number];

export type IntegrityGateResult =
  | { readonly accepted: true; readonly integrity: PlaceholderIntegrityResult }
  | { readonly accepted: false; readonly reason: IntegrityGateReason };

function adapterReportsMarkupAsPlaceholders(adapter: FormatAdapter, sourceValue: string): boolean {
  return adapter.extractPlaceholders(sourceValue).some((token) => token.startsWith("<"));
}

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
  if (
    !compareInlineMarkup(sourceEntry.value, candidateValue).matches &&
    !adapterReportsMarkupAsPlaceholders(adapter, sourceEntry.value)
  ) {
    return { accepted: false, reason: "markup" };
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
