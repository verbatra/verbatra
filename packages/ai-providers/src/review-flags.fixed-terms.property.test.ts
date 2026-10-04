import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { DoNotTranslateTerm, LocaleGlossary } from "./glossary.js";
import { computeReviewFlags } from "./review-flags.js";

const UNICODE_LETTER = /\p{L}/u;
const WORD_CHARACTER = /^[\p{L}\p{M}\p{N}_]$/u;
const NO_WORD_SEPARATORS = /\p{scx=Han}/u;
const FINAL_SIGMA = /\u03c2/gu;
const LOCALES = ["en", "tr", "lt", "el"] as const;

function joinsWords(character: string | undefined): boolean {
  return (
    character !== undefined && WORD_CHARACTER.test(character) && !NO_WORD_SEPARATORS.test(character)
  );
}

function standsAlone(value: string, start: number, end: number): boolean {
  const characters = Array.from(value.slice(start, end));
  const before = Array.from(value.slice(0, start)).at(-1);
  const after = Array.from(value.slice(end))[0];
  const blockedStart = joinsWords(characters[0]) && joinsWords(before);
  const blockedEnd = joinsWords(characters.at(-1)) && joinsWords(after);
  return !blockedStart && !blockedEnd;
}

function fold(text: string, locale: string): string {
  return text.toLocaleLowerCase(locale).replace(FINAL_SIGMA, "\u03c3");
}

function occursAt(candidate: string, fixed: DoNotTranslateTerm, locale: string): boolean {
  return fixed.caseSensitive
    ? candidate === fixed.term
    : fold(candidate, locale) === fold(fixed.term, locale);
}

function coveredRanges(
  value: string,
  terms: readonly DoNotTranslateTerm[],
  locale: string,
): boolean[] {
  const covered = new Array<boolean>(value.length).fill(false);
  for (let start = 0; start < value.length; start += 1) {
    for (let end = start + 1; end <= value.length; end += 1) {
      const candidate = value.slice(start, end);
      if (
        terms.some((fixed) => occursAt(candidate, fixed, locale)) &&
        standsAlone(value, start, end)
      ) {
        covered.fill(true, start, end);
      }
    }
  }
  return covered;
}

function hasLetterOutsideFixedTerms(
  value: string,
  terms: readonly DoNotTranslateTerm[],
  locale = "en",
): boolean {
  const covered = coveredRanges(value, terms, locale);
  let remaining = "";
  for (let index = 0; index < value.length; index += 1) {
    remaining += covered[index] ? " " : value.charAt(index);
  }
  return UNICODE_LETTER.test(remaining);
}

function equalsSourceFlagged(
  value: string,
  terms: readonly DoNotTranslateTerm[],
  locale = "en",
): boolean {
  const glossary: LocaleGlossary = { terms: [], doNotTranslate: terms };
  const flag = computeReviewFlags({
    sourceValue: value,
    translatedValue: value,
    sourceLocale: locale,
    targetLocale: "de",
    integrity: { matches: true, missing: [], extra: [], reordered: false },
    glossary,
  });
  return flag?.reasons.includes("EQUALS_SOURCE") ?? false;
}

const piece = fc.oneof(
  { weight: 4, arbitrary: fc.constantFrom("名", "-a", "-A", "\u0130", "I\u0307", "\u00cc") },
  {
    weight: 4,
    arbitrary: fc.constantFrom("\u03a3", "\u03c3", "\u03c2", "I", "i", "\u0300"),
  },
  { weight: 1, arbitrary: fc.constantFrom("-", "a", "A", "x", "X", " ", "é", "{0}", "😀") },
);
const text = (maxLength: number) =>
  fc.array(piece, { minLength: 1, maxLength }).map((pieces) => pieces.join(""));
const fixedTerm = fc.record({ term: text(4), caseSensitive: fc.boolean() });

describe("computeReviewFlags: EQUALS_SOURCE beside fixed terms", () => {
  it("flags an untranslated value exactly when a letter lies outside every fixed-term occurrence", () => {
    fc.assert(
      fc.property(
        text(16),
        fc.array(fixedTerm, { minLength: 1, maxLength: 3 }),
        fc.constantFrom(...LOCALES),
        (value, terms, locale) => {
          fc.pre(UNICODE_LETTER.test(value.trim()));
          expect(equalsSourceFlagged(value, terms, locale)).toBe(
            hasLetterOutsideFixedTerms(value, terms, locale),
          );
        },
      ),
      { numRuns: 2000 },
    );
  });

  it.each([
    ["-a名名-a", ["名", "-a  -a"]],
    ["名名-a-a", ["名", "  -a-a"]],
    ["名-a-a名", ["-a", "名  名"]],
    ["-a名名", ["名", "-a  "]],
  ] as const)(
    "flags %j although the fixed terms %j only meet across a removed term",
    (value, terms) => {
      const fixed = terms.map((term) => ({ term, caseSensitive: true }));
      expect(equalsSourceFlagged(value, fixed)).toBe(true);
      expect(hasLetterOutsideFixedTerms(value, fixed)).toBe(true);
    },
  );

  it.each([
    [true, "\u540d\u0300"],
    [false, "\u540d\u0300"],
  ])(
    "discounts a fixed term with case sensitivity %s beside a trailing mark in %j",
    (caseSensitive, value) => {
      const fixed = [{ term: "\u540d", caseSensitive }];
      expect(equalsSourceFlagged(value, fixed)).toBe(false);
      expect(hasLetterOutsideFixedTerms(value, fixed)).toBe(false);
    },
  );
});
