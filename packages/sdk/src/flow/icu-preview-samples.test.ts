import { PLURAL_CATEGORIES, type PluralRuleType } from "@verbatra/core";
import { describe, expect, it } from "vitest";
import { defaultPluralSample } from "./icu-preview-samples.js";
import { createSolver } from "./icu-preview-solve.js";
import { pluralCategoriesFor } from "./plural-rules.js";

const LOCALES = [
  "en",
  "de",
  "fr",
  "es",
  "it",
  "pt",
  "pt-PT",
  "nl",
  "sv",
  "da",
  "nb",
  "fi",
  "is",
  "ru",
  "uk",
  "be",
  "pl",
  "cs",
  "sk",
  "sl",
  "hr",
  "sr",
  "bs",
  "bg",
  "mk",
  "ro",
  "hu",
  "el",
  "tr",
  "ar",
  "he",
  "fa",
  "cy",
  "ga",
  "gd",
  "gv",
  "kw",
  "br",
  "lv",
  "lt",
  "mt",
  "et",
  "ja",
  "zh",
  "ko",
  "vi",
  "th",
  "id",
  "hi",
  "bn",
  "ta",
  "fil",
  "ka",
  "hy",
  "az",
  "kk",
  "ca",
  "eu",
  "gl",
  "sq",
  "lb",
  "ast",
  "he-IL",
  "ar-EG",
  "sh",
  "dsb",
  "hsb",
  "se",
  "smn",
  "mo",
  "ceb",
  "tzm",
  "ksh",
  "shi",
  "lag",
  "ff",
  "si",
] as const;

const RULE_TYPES: readonly PluralRuleType[] = ["cardinal", "ordinal"];

function categorySample(
  locale: string,
  ruleType: PluralRuleType,
  category: string,
): number | undefined {
  const step = {
    argument: "n",
    kind: ruleType === "ordinal" ? ("ordinal" as const) : ("plural" as const),
    offset: 0,
    options: ["other"],
    selector: category,
  };
  const sample = createSolver(locale)([{ step, byCategory: true }])?.get("n");
  return typeof sample === "number" ? sample : undefined;
}

describe("createSolver: a sample for every plural category", () => {
  for (const ruleType of RULE_TYPES) {
    it(`finds one for every ${ruleType} category the runtime reports`, () => {
      const missing = LOCALES.flatMap((locale) =>
        pluralCategoriesFor(locale, ruleType)
          .filter((category) => {
            const sample = categorySample(locale, ruleType, category);
            const rules = new Intl.PluralRules(locale, { type: ruleType });
            return sample === undefined || rules.select(sample) !== category;
          })
          .map((category) => `${locale}:${category}`),
      );
      expect(missing).toEqual([]);
    });
  }

  it("answers undefined for a category the locale does not have", () => {
    expect(categorySample("en", "cardinal", "zero")).toBeUndefined();
    expect(PLURAL_CATEGORIES).toContain("zero");
  });
});

describe("defaultPluralSample", () => {
  it("prefers a whole number in the other category", () => {
    expect(defaultPluralSample("en", "cardinal", 0, new Set())).toBe(2);
    expect(defaultPluralSample("en", "ordinal", 0, new Set())).toBe(4);
  });

  it("falls back to a whole number where the locale has no whole other", () => {
    const sample = defaultPluralSample("pl", "cardinal", 0, new Set());
    expect(Number.isInteger(sample)).toBe(true);
    expect(sample).toBeGreaterThanOrEqual(2);
  });

  it("skips values an exact arm would intercept and applies the offset", () => {
    expect(defaultPluralSample("en", "cardinal", 0, new Set([2]))).toBe(3);
    expect(defaultPluralSample("en", "cardinal", 1, new Set())).toBe(3);
  });
});
