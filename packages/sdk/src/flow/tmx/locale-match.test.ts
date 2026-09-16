import { describe, expect, it } from "vitest";
import { matchLanguageTag } from "./locale-match.js";

describe("matchLanguageTag matches an exact spelling first", () => {
  it("matches a tag that is spelled identically", () => {
    expect(matchLanguageTag("de", ["de", "fr"])).toEqual({ kind: "matched", locale: "de" });
  });

  it("matches across letter case, because a language tag is case-insensitive", () => {
    expect(matchLanguageTag("PT-br", ["pt-BR"])).toEqual({ kind: "matched", locale: "pt-BR" });
  });

  it("matches across the underscore and hyphen spellings of the same tag", () => {
    expect(matchLanguageTag("pt-BR", ["pt_BR"])).toEqual({ kind: "matched", locale: "pt_BR" });
    expect(matchLanguageTag("pt_BR", ["pt-BR"])).toEqual({ kind: "matched", locale: "pt-BR" });
  });

  it("ignores surrounding whitespace, which a writer can leave in an attribute", () => {
    expect(matchLanguageTag("  de  ", ["de"])).toEqual({ kind: "matched", locale: "de" });
  });

  it("prefers the exact spelling over a region-stripped one", () => {
    expect(matchLanguageTag("pt-BR", ["pt", "pt-BR"])).toEqual({
      kind: "matched",
      locale: "pt-BR",
    });
  });
});

describe("matchLanguageTag falls back to the primary subtag only when it is unambiguous", () => {
  it("matches a regional tag onto the one configured locale sharing its language", () => {
    expect(matchLanguageTag("en-US", ["en", "de"])).toEqual({ kind: "matched", locale: "en" });
  });

  it("matches a bare tag onto the one configured regional locale sharing its language", () => {
    expect(matchLanguageTag("pt", ["pt-BR", "de"])).toEqual({ kind: "matched", locale: "pt-BR" });
  });

  it("matches one region onto another when only one is configured", () => {
    expect(matchLanguageTag("en-GB", ["en-US"])).toEqual({ kind: "matched", locale: "en-US" });
  });

  it("refuses to guess when two configured locales share the language", () => {
    expect(matchLanguageTag("pt-PT", ["pt-BR", "pt-AO"])).toEqual({
      kind: "ambiguous",
      candidates: ["pt-BR", "pt-AO"],
    });
  });

  it("reports a tag whose language matches nothing configured", () => {
    expect(matchLanguageTag("ja", ["de", "fr"])).toEqual({ kind: "unmatched" });
  });

  it("reports an empty tag rather than matching the first configured locale", () => {
    expect(matchLanguageTag("", ["de"])).toEqual({ kind: "unmatched" });
  });

  it("does not treat a longer language as a match for a shorter one", () => {
    expect(matchLanguageTag("des", ["de"])).toEqual({ kind: "unmatched" });
  });

  it("matches a three-subtag tag on its language when that language is unique", () => {
    expect(matchLanguageTag("zh-Hans-CN", ["zh"])).toEqual({ kind: "matched", locale: "zh" });
  });
});
