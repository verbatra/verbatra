import { describe, expect, it } from "vitest";
import {
  CLDR_CATEGORY_ORDER,
  describePluralRules,
  pluralCategoriesFor,
  pluralCategoryLookupFor,
  pluralRulesRuntime,
  resolvePluralCategories,
} from "./plural-rules.js";

const LEGACY_TABLE: Readonly<Record<string, readonly string[]>> = {
  ar: ["zero", "one", "two", "few", "many", "other"],
  cy: ["zero", "one", "two", "few", "many", "other"],
  ga: ["one", "two", "few", "many", "other"],
  pl: ["one", "few", "many", "other"],
  ru: ["one", "few", "many", "other"],
  uk: ["one", "few", "many", "other"],
  be: ["one", "few", "many", "other"],
  lt: ["one", "few", "many", "other"],
  sl: ["one", "two", "few", "other"],
};

describe("pluralCategoriesFor: CLDR cardinal categories", () => {
  it.each([
    ["ar", ["zero", "one", "two", "few", "many", "other"]],
    ["cy", ["zero", "one", "two", "few", "many", "other"]],
    ["he", ["one", "two", "other"]],
    ["cs", ["one", "few", "many", "other"]],
    ["sk", ["one", "few", "many", "other"]],
    ["ro", ["one", "few", "other"]],
    ["pl", ["one", "few", "many", "other"]],
    ["ru", ["one", "few", "many", "other"]],
    ["fr", ["one", "many", "other"]],
    ["es", ["one", "many", "other"]],
    ["it", ["one", "many", "other"]],
    ["pt", ["one", "many", "other"]],
    ["ja", ["other"]],
    ["zh", ["other"]],
    ["ko", ["other"]],
    ["en", ["one", "other"]],
    ["de", ["one", "other"]],
  ])("resolves %s to %j", (locale, expected) => {
    expect(pluralCategoriesFor(locale)).toEqual(expected);
  });

  it.each(Object.entries(LEGACY_TABLE))(
    "keeps %s identical to the hand-maintained table it replaces",
    (locale, expected) => {
      expect(pluralCategoriesFor(locale)).toEqual(expected);
    },
  );

  it.each([
    ["ru-RU", "ru"],
    ["pt_BR", "pt"],
    ["zh-Hant-TW", "zh"],
    ["iw", "he"],
    ["PL", "pl"],
    ["en-XX", "en"],
    ["de-XX", "de"],
    ["sr-Latn", "sr"],
  ])("resolves the tag %s like its language %s", (tag, language) => {
    expect(pluralCategoriesFor(tag)).toEqual(pluralCategoriesFor(language));
  });

  it("always lists categories in CLDR order", () => {
    for (const locale of ["ar", "cy", "ga", "mt", "gd", "cs", "fr", "he", "sl"]) {
      const categories = pluralCategoriesFor(locale);
      const indices = categories.map((category) => CLDR_CATEGORY_ORDER.indexOf(category));
      expect(indices).toEqual([...indices].sort((left, right) => left - right));
      expect(categories.at(-1)).toBe("other");
    }
  });
});

describe("resolvePluralCategories: locales ICU does not know", () => {
  it.each(["tlh", "und", "x-pseudo", "not a locale", ""])(
    "falls back to one and other for %j",
    (locale) => {
      expect(resolvePluralCategories(locale)).toEqual({
        kind: "fallback",
        categories: ["one", "other"],
      });
    },
  );

  it("never borrows the rules of the locale ICU would substitute for an unknown tag", () => {
    const substitute = new Intl.PluralRules("tlh", { type: "ordinal" }).resolvedOptions().locale;
    expect(pluralCategoriesFor(substitute, "ordinal")).not.toEqual(["other"]);
    expect(pluralCategoriesFor("tlh", "ordinal")).toEqual(["other"]);
  });

  it("returns the same resolution on a repeated lookup", () => {
    expect(resolvePluralCategories("cs")).toBe(resolvePluralCategories("cs"));
  });
});

describe("pluralCategoriesFor: ordinal categories", () => {
  it.each([
    ["en", ["one", "two", "few", "other"]],
    ["fr", ["one", "other"]],
    ["de", ["other"]],
    ["cy", ["zero", "one", "two", "few", "many", "other"]],
  ])("resolves %s to %j", (locale, expected) => {
    expect(pluralCategoriesFor(locale, "ordinal")).toEqual(expected);
  });

  it("keeps ordinal and cardinal lookups apart", () => {
    expect(pluralCategoriesFor("en", "ordinal")).not.toEqual(pluralCategoriesFor("en"));
  });

  it("falls back to other alone for an unknown locale", () => {
    expect(resolvePluralCategories("tlh", "ordinal")).toEqual({
      kind: "fallback",
      categories: ["other"],
    });
  });
});

describe("pluralRulesRuntime", () => {
  it("reads the ICU and CLDR versions the runtime reports", () => {
    expect(pluralRulesRuntime({ icu: "78.3", cldr: "48.0" })).toEqual({
      icu: "78.3",
      cldr: "48.0",
    });
  });

  it("defaults to the running process", () => {
    expect(pluralRulesRuntime()).toEqual({
      icu: process.versions.icu,
      cldr: process.versions.cldr,
    });
  });
});

describe("describePluralRules", () => {
  const runtime = { icu: "78.3", cldr: "48.0" };

  it("names the ICU and CLDR versions when every target locale is known", () => {
    expect(describePluralRules(["de", "fr", "ja"], runtime)).toBe(
      "ICU 78.3 (CLDR 48.0) supplies the plural rules; every target locale has CLDR plural rules.",
    );
  });

  it("lists every target locale ICU has no rules for", () => {
    const detail = describePluralRules(["de", "tlh", "x-pseudo"], runtime);
    expect(detail).toContain('"tlh", "x-pseudo"');
    expect(detail).not.toContain('"de"');
    expect(detail).toContain("assume one and other");
  });

  it("omits the CLDR version when the runtime does not report one", () => {
    expect(describePluralRules(["de"], { icu: "78.3", cldr: undefined })).toMatch(
      /^ICU 78\.3 supplies/,
    );
  });

  it("says so when the runtime reports no ICU version", () => {
    expect(describePluralRules(["de"], { icu: undefined, cldr: undefined })).toMatch(
      /^The runtime reports no ICU version;/,
    );
  });

  it("defaults to the running process's versions", () => {
    expect(describePluralRules(["de"])).toContain(`ICU ${process.versions.icu}`);
  });
});

describe("pluralCategoryLookupFor", () => {
  it("answers each rule type from CLDR for a language the runtime knows", () => {
    const lookup = pluralCategoryLookupFor("cy");
    expect(lookup("cardinal")).toEqual(["zero", "one", "two", "few", "many", "other"]);
    expect(lookup("ordinal")).toEqual(["zero", "one", "two", "few", "many", "other"]);
    expect(pluralCategoryLookupFor("en")("ordinal")).toEqual(["one", "two", "few", "other"]);
  });

  it("answers undefined rather than the fallback for a language it does not know", () => {
    const lookup = pluralCategoryLookupFor("x-klingon");
    expect(lookup("cardinal")).toBeUndefined();
    expect(lookup("ordinal")).toBeUndefined();
  });
});
