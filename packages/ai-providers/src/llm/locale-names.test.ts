import { describe, expect, it } from "vitest";
import { localeNamesOf } from "./locale-names.js";

describe("localeNamesOf: English names for the language, script and region", () => {
  it.each([
    ["en", { name: "English" }],
    ["de", { name: "German" }],
    ["sr-Latn", { name: "Serbian (Latin)", script: "Latin" }],
    ["sr-Cyrl", { name: "Serbian (Cyrillic)", script: "Cyrillic" }],
    ["sr-Latn-RS", { name: "Serbian (Latin, Serbia)", script: "Latin", region: "Serbia" }],
    [
      "zh-Hant-TW",
      { name: "Chinese (Traditional, Taiwan)", script: "Traditional", region: "Taiwan" },
    ],
    ["zh-Hans", { name: "Chinese (Simplified)", script: "Simplified" }],
    ["pt-BR", { name: "Portuguese (Brazil)", region: "Brazil" }],
    ["pt-PT", { name: "Portuguese (Portugal)", region: "Portugal" }],
    ["es-419", { name: "Spanish (Latin America)", region: "Latin America" }],
    ["ckb", { name: "Central Kurdish" }],
    ["fil", { name: "Filipino" }],
    ["yue", { name: "Cantonese" }],
  ])("names %s", (locale, expected) => {
    expect(localeNamesOf(locale)).toEqual(expected);
  });

  it("names the language of a tag with a private-use suffix and ignores the suffix", () => {
    expect(localeNamesOf("en-x-internal")).toEqual({ name: "English" });
  });
});

describe("localeNamesOf: the unknown-script and unknown-region placeholder subtags", () => {
  it.each([
    ["sr-Zzzz", { name: "Serbian" }],
    ["de-ZZ", { name: "German" }],
    ["sr-Zzzz-ZZ", { name: "Serbian" }],
    ["sr-Latn-ZZ", { name: "Serbian (Latin)", script: "Latin" }],
    ["pt-Zzzz-BR", { name: "Portuguese (Brazil)", region: "Brazil" }],
  ])("leaves the placeholder out of the names of %s", (locale, expected) => {
    expect(localeNamesOf(locale)).toEqual(expected);
  });
});

describe("localeNamesOf: an unknown or unparseable tag", () => {
  it.each([
    ["a private-use language", "qaa"],
    ["an unassigned language", "xx"],
    ["a known language with an unknown region", "de-QQ"],
    ["a private-use-only tag", "x-private"],
    ["a malformed tag", "not a locale"],
    ["an empty string", ""],
  ])("returns undefined for %s rather than throwing", (_label, locale) => {
    expect(localeNamesOf(locale)).toBeUndefined();
  });
});
