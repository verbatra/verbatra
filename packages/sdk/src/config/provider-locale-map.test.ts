import { describe, expect, it } from "vitest";
import { findUnknownLocaleMapKeys } from "./provider-locale-map.js";

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
