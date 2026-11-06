import { PLURAL_CATEGORIES, type PluralRuleType } from "@verbatra/core";
import { describe, expect, it } from "vitest";
import { pluralSamples } from "./icu-preview-samples.js";
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

describe("pluralSamples", () => {
  for (const ruleType of RULE_TYPES) {
    it(`finds a sample for every ${ruleType} category the runtime reports`, () => {
      const missing: string[] = [];
      for (const locale of LOCALES) {
        const categories = pluralCategoriesFor(locale, ruleType);
        const found = pluralSamples({ locale, ruleType, offset: 0, avoid: new Set(), categories });
        for (const category of categories) {
          if (!found.has(category)) {
            missing.push(`${locale}:${category}`);
          }
        }
      }
      expect(missing).toEqual([]);
    });
  }

  it("selects the category it reports for each sample", () => {
    const rules = new Intl.PluralRules("ar");
    const found = pluralSamples({
      locale: "ar",
      ruleType: "cardinal",
      offset: 0,
      avoid: new Set(),
      categories: PLURAL_CATEGORIES,
    });
    for (const [category, sample] of found) {
      expect(rules.select(sample)).toBe(category);
    }
  });
});
