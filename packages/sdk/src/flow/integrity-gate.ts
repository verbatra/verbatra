import {
  assessValueDegeneracy,
  checkPlaceholders,
  type PlaceholderIntegrityResult,
  type TranslationEntry,
} from "@verbatra/core";
import type { FormatAdapter } from "@verbatra/format-adapters";
import { judgeEntryMarkup } from "./markup-verdict.js";

/**
 * Every reason a candidate translation can be refused before it is written. The same gate guards
 * every write path: a provider translation, a cache or duplicate-content reuse, a generated plural
 * form, a pseudolocalized value, a workbook or TMX import, {@link editEntry}, and
 * {@link retranslateEntry}, so a hand-typed value and a provider-produced one are held to identical
 * standards.
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
 *   interpolation, or it would make an HTML parser create markup the source does not have. Tags
 *   are read the way an HTML parser reads them (quoted attribute values may contain `>`, and the
 *   content of a raw text element such as `script`, `style`, `title` or `textarea` is text up to
 *   its closing tag) and compared as a multiset of names plus attribute names, so a different word
 *   order and a translated attribute value are both accepted, and the two spellings of a void
 *   element (`<br>` and `<br/>`) are one tag. Tag names are compared exactly, while the HTML void
 *   elements are recognised as needing no closing tag in any case spelling. An unclosed bracketed
 *   word that is only a name of letters, digits, hyphens, and underscores, such as `<Enter>`, is
 *   set aside on both sides and counted like a tag once the source carries tags; where the source
 *   has no tags, the candidate is refused for a closing tag with no opening tag, an unclosed tag
 *   that carries anything beyond its name, any closed pair, void, or self-closing tag, and a
 *   bracketed word the source does not carry that names a standard HTML element, `image`, or a
 *   custom element (any name with a hyphen). Comments, CDATA sections, declarations, processing
 *   instructions, and a `</` not followed by a letter end where an HTML parser ends them and are
 *   compared as a multiset of their text, so one the candidate adds, drops, or rewrites is
 *   refused. A source whose own tags are not well formed is still compared as a multiset, and no
 *   source is too large to compare; a candidate is refused once it carries more than twice its
 *   source's tags and constructs, or more than 256 for a smaller source. Also refused: a tag the
 *   candidate never finishes when the source finishes all of its own; a `javascript:`,
 *   `vbscript:`, or `data:` scheme in a URL attribute value, read after decoding character
 *   references, unless the source carries that exact value on the same tag and attribute; a URL
 *   in such a value whose scheme and authority no source value of the same tag and attribute has,
 *   or a relative URL made absolute; a changed value of `meta` `http-equiv` or `content`, `script`
 *   `type`, `nomodule`, `integrity` or `crossorigin`, `link` `rel`, `as`, `integrity`,
 *   `crossorigin` or `type`, `base` `target`, SVG animation `attributeName` or `attributeType`,
 *   `iframe` `sandbox`, `allow` or `allowfullscreen`, `form` `method`, `enctype` or `target`, or
 *   any `style`, `srcdoc` or event handler; any change to the content of a `script`, `style`,
 *   `iframe`, `noembed`, `noframes`, `noscript`, `xmp`, or `plaintext` element (`title` and
 *   `textarea` content may be translated); and, unless the candidate is the source unchanged,
 *   raw text an HTML parser can read two ways (a `script` whose content opens `<!--`, a `noscript`
 *   whose content holds a `<`, a raw text element whose content holds a `<` after an `svg`,
 *   `math`, or `select` tag) or a CDATA section or `image` tag in a value that opens `svg`, `math`,
 *   or `select`. The check stands down per tag: a tag the format already reports as a placeholder
 *   (an XLIFF inline element, a next-intl or ARB ICU rich-text tag) is left to the `placeholder`
 *   reason together with as many closing tags as it has openings, while one the candidate leaves
 *   unclosed, one that no longer nests with the other tags as in the source, and one the source
 *   carries only as text are still refused, and any other tag in the same value is still
 *   compared, including a second spelling of the same name. The refusal's `details` names the
 *   offending tags.
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
      readonly details?: readonly string[];
    };

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
  const markup = judgeEntryMarkup(sourceEntry, candidateValue);
  if (!markup.matches) {
    return markup.details.length > 0
      ? { accepted: false, reason: "markup", details: markup.details }
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
