import { describe, expect, it } from "vitest";
import { conventionalSubtags, parseLocaleTag } from "./locale-tag.js";

describe("parseLocaleTag", () => {
  it.each([
    ["de", { language: "de", script: undefined, region: undefined, variants: [] }],
    ["zh-Hant-TW", { language: "zh", script: "hant", region: "tw", variants: [] }],
    ["es-419", { language: "es", script: undefined, region: "419", variants: [] }],
    ["sl-Latn-rozaj", { language: "sl", script: "latn", region: undefined, variants: ["rozaj"] }],
  ])("reads %s", (locale, expected) => {
    expect(parseLocaleTag(locale)).toEqual(expected);
  });

  it.each(["", "german", "en-u-ca-gregory", "x"])("rejects %j", (locale) => {
    expect(parseLocaleTag(locale)).toBeUndefined();
  });
});

describe("conventionalSubtags", () => {
  it("title-cases the script and upper-cases the region", () => {
    const tag = parseLocaleTag("zh-hant-tw");
    expect(tag === undefined ? [] : conventionalSubtags(tag)).toEqual(["zh", "Hant", "TW"]);
  });

  it("keeps a bare language and its variants as they are", () => {
    const tag = parseLocaleTag("de-1996");
    expect(tag === undefined ? [] : conventionalSubtags(tag)).toEqual(["de", "1996"]);
  });
});
