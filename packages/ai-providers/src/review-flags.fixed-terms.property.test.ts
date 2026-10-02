import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { LocaleGlossary } from "./glossary.js";
import { computeReviewFlags } from "./review-flags.js";
import { wholeTermIndices } from "./whole-term.js";

const UNICODE_LETTER = /\p{L}/u;

function withoutCoveredRuns(text: string, term: string): string {
  const covered = new Array<boolean>(text.length).fill(false);
  for (const index of wholeTermIndices(text, term)) {
    for (let offset = 0; offset < term.length; offset += 1) {
      covered[index + offset] = true;
    }
  }
  let remaining = "";
  for (let index = 0; index < text.length; index += 1) {
    if (!covered[index]) {
      remaining += text.charAt(index);
    } else if (!covered[index - 1]) {
      remaining += " ";
    }
  }
  return remaining;
}

function hasLetterOutsideFixedTerms(value: string, terms: readonly string[]): boolean {
  const remaining = terms.reduce((text, term) => withoutCoveredRuns(text, term), value);
  return UNICODE_LETTER.test(remaining);
}

const piece = fc.oneof(
  { weight: 4, arbitrary: fc.constantFrom("名", "-a") },
  { weight: 1, arbitrary: fc.constantFrom("-", "a", "x", " ", "é", "{0}", "😀") },
);
const text = (maxLength: number) =>
  fc.array(piece, { minLength: 1, maxLength }).map((pieces) => pieces.join(""));

describe("computeReviewFlags: EQUALS_SOURCE beside fixed terms", () => {
  it("flags an untranslated value exactly when a letter lies outside every fixed-term occurrence", () => {
    fc.assert(
      fc.property(text(16), fc.array(text(4), { minLength: 1, maxLength: 3 }), (value, terms) => {
        fc.pre(UNICODE_LETTER.test(value.trim()));
        const glossary: LocaleGlossary = {
          terms: [],
          doNotTranslate: terms.map((term) => ({ term, caseSensitive: true })),
        };
        const flag = computeReviewFlags({
          sourceValue: value,
          translatedValue: value,
          sourceLocale: "en",
          targetLocale: "de",
          integrity: { matches: true, missing: [], extra: [], reordered: false },
          glossary,
        });

        expect(flag?.reasons.includes("EQUALS_SOURCE") ?? false).toBe(
          hasLetterOutsideFixedTerms(value, terms),
        );
      }),
      { numRuns: 2000 },
    );
  });
});
