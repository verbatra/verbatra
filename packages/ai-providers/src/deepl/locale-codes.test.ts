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
    ["es-ES", "ES"],
    ["sr-Latn", "SR"],
    ["en-AU", "EN"],
    ["en", "EN"],
  ])("falls back to the language of %s, sending %s", (locale, expected) => {
    expect(toDeepLTargetCode(locale)).toBe(expected);
  });

  it.each([
    "MX",
    "AR",
    "CO",
    "CL",
    "PE",
    "VE",
    "EC",
    "GT",
    "CU",
    "BO",
    "DO",
    "HN",
    "PY",
    "SV",
    "NI",
    "CR",
    "PA",
    "UY",
    "PR",
    "US",
    "419",
  ])("sends Spanish for the Latin American or Caribbean region %s as ES-419", (region) => {
    expect(toDeepLTargetCode(`es-${region}`)).toBe("ES-419");
  });

  it("does not map a non-Spanish language with a Latin American region to ES-419", () => {
    expect(toDeepLTargetCode("pt-MX")).toBe("PT");
    expect(toDeepLTargetCode("en-US")).toBe("EN-US");
  });

  it("keeps the first subtag of a code Intl cannot parse", () => {
    expect(toDeepLTargetCode("de_AT-x")).toBe("DE_AT");
  });
});
