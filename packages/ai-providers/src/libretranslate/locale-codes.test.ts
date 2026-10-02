import { describe, expect, it } from "vitest";
import { toLibreTranslateCode } from "./locale-codes.js";

describe("toLibreTranslateCode", () => {
  it.each([
    ["de", "de"],
    ["de-AT", "de"],
    ["en-US", "en"],
    ["pt-BR", "pt-BR"],
    ["pt-PT", "pt"],
    ["zh-Hans", "zh-Hans"],
    ["zh-TW", "zh-Hant"],
    ["zh-CN", "zh-Hans"],
    ["zh", "zh"],
    ["nb-NO", "nb"],
  ])("sends %s as %s", (locale, code) => {
    expect(toLibreTranslateCode(locale)).toBe(code);
  });

  it("passes a value that is not a locale through unchanged", () => {
    expect(toLibreTranslateCode("not a locale")).toBe("not a locale");
  });
});
