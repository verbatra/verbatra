import { describe, expect, it } from "vitest";
import { toDeepLSourceCode, toDeepLTargetCode } from "./locale-codes.js";

describe("toDeepLSourceCode", () => {
  it.each([
    ["en", "EN"],
    ["en-US", "EN"],
    ["pt-BR", "PT"],
    ["zh-Hant-TW", "ZH"],
    ["sr-Latn", "SR"],
    ["es-419", "ES"],
    ["iw", "HE"],
  ])("strips region and script from %s, sending %s", (locale, expected) => {
    expect(toDeepLSourceCode(locale)).toBe(expected);
  });

  it("keeps the first subtag of a code Intl cannot parse", () => {
    expect(toDeepLSourceCode("en_US-x")).toBe("EN_US");
  });
});

describe("toDeepLTargetCode", () => {
  it.each([
    ["zh-Hant", "ZH-HANT"],
    ["zh-TW", "ZH-HANT"],
    ["zh-HK", "ZH-HANT"],
    ["zh-MO", "ZH-HANT"],
    ["zh-Hant-TW", "ZH-HANT"],
    ["zh-Hans", "ZH-HANS"],
    ["zh-CN", "ZH-HANS"],
    ["zh-SG", "ZH-HANS"],
    ["zh-hans-cn", "ZH-HANS"],
    ["zh", "ZH"],
    ["zh-US", "ZH"],
  ])("maps the Chinese locale %s to %s", (locale, expected) => {
    expect(toDeepLTargetCode(locale)).toBe(expected);
  });

  it.each([
    ["en-US", "EN-US"],
    ["en-gb", "EN-GB"],
    ["pt-BR", "PT-BR"],
    ["pt-PT", "PT-PT"],
    ["es-419", "ES-419"],
    ["fr-CA", "FR-CA"],
    ["de-CH", "DE-CH"],
  ])("keeps the DeepL regional variant %s as %s", (locale, expected) => {
    expect(toDeepLTargetCode(locale)).toBe(expected);
  });

  it.each([
    ["de", "DE"],
    ["de-AT", "DE"],
    ["es-MX", "ES"],
    ["sr-Latn", "SR"],
    ["en-AU", "EN"],
    ["en", "EN"],
  ])("falls back to the language of %s, sending %s", (locale, expected) => {
    expect(toDeepLTargetCode(locale)).toBe(expected);
  });

  it("keeps the first subtag of a code Intl cannot parse", () => {
    expect(toDeepLTargetCode("de_AT-x")).toBe("DE_AT");
  });
});
