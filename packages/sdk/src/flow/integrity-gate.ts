import {
  assessValueDegeneracy,
  checkPlaceholders,
  compareInlineMarkup,
  type InlineMarkupComparison,
  inlineTagToken,
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
 *   carries them unbalanced, mis-nested, or newly nested inside another tag of the same name, any
 *   of which breaks the rendering of the string the way a dropped placeholder breaks its
 *   interpolation. Tags are compared as a multiset of names plus attribute names, so a different
 *   word order and a translated attribute value are both accepted, and the two spellings of a void
 *   element (`<br>` and `<br/>`) are one tag. Tag names are compared exactly, and only the
 *   lowercase spellings of the HTML void elements are treated as needing no closing tag. The check
 *   is silent unless the source's own markup is well formed, and it stands down per tag: a tag the
 *   format already reports as a placeholder (an XLIFF inline element, a next-intl or ARB ICU
 *   rich-text tag) is left to the `placeholder` reason together with the closing tag that pairs
 *   with it, while any other tag in the same value is still compared, including a second spelling
 *   of the same name. {@link IntegrityGateResult} names the offending tags in `details`.
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
  | {
      readonly accepted: false;
      readonly reason: IntegrityGateReason;
      /**
       * The specific tokens behind the refusal, when the reason can name them, each prefixed with
       * `-` for something the source had and the candidate dropped or `+` for something the
       * candidate invented. Absent for a reason that has nothing to name, and absent for
       * structurally broken markup, where no single tag is at fault.
       */
      readonly details?: readonly string[];
    };

function placeholderTags(placeholders: readonly string[]): readonly string[] {
  const tags: string[] = [];
  for (const placeholder of placeholders) {
    const tag = inlineTagToken(placeholder);
    if (tag !== undefined) {
      tags.push(tag);
    }
  }
  return tags;
}

function markupDetails(comparison: InlineMarkupComparison): readonly string[] {
  return [
    ...comparison.missing.map((token) => `-${token}`),
    ...comparison.extra.map((token) => `+${token}`),
  ];
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
  const markup = compareInlineMarkup(sourceEntry.value, candidateValue, {
    ignoreTags: placeholderTags(sourceEntry.placeholders),
  });
  if (!markup.matches) {
    const details = markupDetails(markup);
    return details.length > 0
      ? { accepted: false, reason: "markup", details }
      : { accepted: false, reason: "markup" };
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
