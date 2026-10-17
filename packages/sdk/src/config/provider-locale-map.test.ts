import { describe, expect, it } from "vitest";
import { findDroppedLocaleMapKeys, findUnknownLocaleMapKeys } from "./provider-locale-map.js";

const locales = { sourceLocale: "en", targetLocales: ["de", "zh-Hant"] } as const;

describe("findUnknownLocaleMapKeys", () => {
  it("finds nothing for the none provider", () => {
    expect(findUnknownLocaleMapKeys({ ...locales, provider: { id: "none", options: {} } })).toEqual(
      [],
    );
  });

  it("finds nothing when the provider has no localeMap", () => {
    expect(
      findUnknownLocaleMapKeys({ ...locales, provider: { id: "deepl", options: {} } }),
    ).toEqual([]);
  });

  it("finds only the keys that name no configured locale", () => {
    const found = findUnknownLocaleMapKeys({
      ...locales,
      provider: {
        id: "deepl",
        options: { localeMap: { en: "EN", fr: "FR", "zh-Hant": "ZH-HANT" } },
      },
    });
    expect(found.map(({ key }) => key)).toEqual(["fr"]);
    expect(found[0]?.message).not.toContain("did you mean");
  });
});

describe("findDroppedLocaleMapKeys", () => {
  const deepl = {
    ...locales,
    provider: { id: "deepl", options: { localeMap: { de: "DE" } } },
  } as const;

  it("finds a raw key that parsing dropped", () => {
    const raw = JSON.parse(
      '{"provider": {"options": {"localeMap": {"de": "DE", "__proto__": "x"}}}}',
    );

    expect(findDroppedLocaleMapKeys(deepl, raw)).toEqual([
      {
        key: "__proto__",
        message: expect.stringContaining('"__proto__" is not a configured locale'),
      },
    ]);
  });

  it("finds nothing when every raw key survived parsing", () => {
    expect(
      findDroppedLocaleMapKeys(deepl, { provider: { options: { localeMap: { de: "DE" } } } }),
    ).toEqual([]);
  });

  it.each([
    ["no provider", {}],
    ["a non-object provider", { provider: "deepl" }],
    ["no options", { provider: {} }],
    ["an array localeMap", { provider: { options: { localeMap: ["x"] } } }],
    ["a null localeMap", { provider: { options: { localeMap: null } } }],
    ["a non-object config", "config"],
  ])("finds nothing for %s", (_label, raw) => {
    expect(findDroppedLocaleMapKeys(deepl, raw)).toEqual([]);
  });

  it("finds nothing for the none provider", () => {
    const raw = JSON.parse('{"provider": {"options": {"localeMap": {"__proto__": "x"}}}}');

    expect(
      findDroppedLocaleMapKeys({ ...locales, provider: { id: "none", options: {} } }, raw),
    ).toEqual([]);
  });

  it("treats a parsed provider without a localeMap as an empty map", () => {
    const raw = JSON.parse('{"provider": {"options": {"localeMap": {"__proto__": "x"}}}}');

    expect(
      findDroppedLocaleMapKeys({ ...locales, provider: { id: "deepl", options: {} } }, raw),
    ).toHaveLength(1);
  });
});
