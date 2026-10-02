import { describe, expect, it } from "vitest";
import { toGoogleTranslateCode } from "./locale-codes.js";

describe("toGoogleTranslateCode", () => {
  it.each([
    ["zh-Hant", "zh-TW"],
    ["zh-Hant-HK", "zh-TW"],
    ["zh-HK", "zh-TW"],
    ["zh-Hans", "zh-CN"],
    ["zh-SG", "zh-CN"],
    ["zh-TW", "zh-TW"],
    ["nb", "no"],
  ])("maps %s to the Cloud Translation code %s", (locale, expected) => {
    expect(toGoogleTranslateCode(locale)).toBe(expected);
  });

  it.each(["en", "pt-BR", "zh", "nb-NO", "sr-Latn", "iw", "es-419"])(
    "sends %s unchanged",
    (locale) => {
      expect(toGoogleTranslateCode(locale)).toBe(locale);
    },
  );

  it("sends a code Intl cannot parse unchanged, for the syntax check to reject", () => {
    expect(toGoogleTranslateCode("en_US")).toBe("en_US");
  });
});
