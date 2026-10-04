import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { LocaleGlossary } from "./glossary.js";
import { computeReviewFlags } from "./review-flags.js";
import { wholeTermIndices } from "./whole-term.js";

const UNICODE_LETTER = /\p{L}/u;

function hasLetterOutsideFixedTerms(value: string, terms: readonly string[]): boolean {
  const covered = new Array<boolean>(value.length).fill(false);
  for (const term of terms) {
    for (const index of wholeTermIndices(value, term)) {
      for (let offset = 0; offset < term.length; offset += 1) {
        covered[index + offset] = true;
      }
    }
  }
  let remaining = "";
  for (let index = 0; index < value.length; index += 1) {
    remaining += covered[index] ? " " : value.charAt(index);
  }
  return UNICODE_LETTER.test(remaining);
}

function equalsSourceFlagged(value: string, terms: readonly string[]): boolean {
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
  return flag?.reasons.includes("EQUALS_SOURCE") ?? false;
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
        expect(equalsSourceFlagged(value, terms)).toBe(hasLetterOutsideFixedTerms(value, terms));
      }),
      { numRuns: 2000 },
    );
  });

  it.each([
    ["-a名名-a", ["名", "-a -a"], true],
    ["名名-a-a", ["名", "  -a-a"], true],
    ["名-a-a名", ["-a", "名 名"], true],
    ["-a名名", ["名", "-a  "], true],
    ["-a名名", ["名", "-a"], false],
  ] as const)("flags %j with fixed terms %j: %s", (value, terms, expected) => {
    expect(equalsSourceFlagged(value, terms)).toBe(expected);
    expect(hasLetterOutsideFixedTerms(value, terms)).toBe(expected);
  });
});
