import { describe, expect, it } from "vitest";
import { matchLanguageTag } from "./locale-match.js";

describe("matchLanguageTag matches an exact spelling first", () => {
  it("matches a tag that is spelled identically", () => {
    expect(matchLanguageTag("de", ["de", "fr"])).toEqual({
      kind: "matched",
      locale: "de",
      exact: true,
    });
  });

  it("matches across letter case, because a language tag is case-insensitive", () => {
    expect(matchLanguageTag("PT-br", ["pt-BR"])).toMatchObject({
      kind: "matched",
      locale: "pt-BR",
    });
  });

  it("matches across the underscore and hyphen spellings of the same tag", () => {
    expect(matchLanguageTag("pt-BR", ["pt_BR"])).toMatchObject({
      kind: "matched",
      locale: "pt_BR",
    });
    expect(matchLanguageTag("pt_BR", ["pt-BR"])).toMatchObject({
      kind: "matched",
      locale: "pt-BR",
    });
  });

  it("ignores surrounding whitespace, which a writer can leave in an attribute", () => {
    expect(matchLanguageTag("  de  ", ["de"])).toMatchObject({ kind: "matched", locale: "de" });
  });

  it("prefers the exact spelling over a region-stripped one", () => {
    expect(matchLanguageTag("pt-BR", ["pt", "pt-BR"])).toEqual({
      kind: "matched",
      locale: "pt-BR",
      exact: true,
    });
  });
});

describe("matchLanguageTag falls back only along a subtag prefix, and only when it is unambiguous", () => {
  it("matches a regional tag onto the one configured locale it extends", () => {
    expect(matchLanguageTag("en-US", ["en", "de"])).toEqual({
      kind: "matched",
      locale: "en",
      exact: false,
    });
  });

  it("matches a bare tag onto the one configured regional locale extending it", () => {
    expect(matchLanguageTag("pt", ["pt-BR", "de"])).toEqual({
      kind: "matched",
      locale: "pt-BR",
      exact: false,
    });
  });

  it("never matches one region onto another", () => {
    expect(matchLanguageTag("en-GB", ["en-US"])).toEqual({ kind: "unmatched" });
    expect(matchLanguageTag("de-AT", ["de-CH"])).toEqual({ kind: "unmatched" });
    expect(matchLanguageTag("pt-PT", ["pt-BR"])).toEqual({ kind: "unmatched" });
  });

  it("never matches one script onto another", () => {
    expect(matchLanguageTag("zh-CN", ["zh-TW"])).toEqual({ kind: "unmatched" });
    expect(matchLanguageTag("sr-Latn", ["sr-Cyrl"])).toEqual({ kind: "unmatched" });
    expect(matchLanguageTag("zh-Hant-TW", ["zh-TW"])).toEqual({ kind: "unmatched" });
  });

  it("does not let a sibling region reach a configured locale it does not extend", () => {
    expect(matchLanguageTag("pt-PT", ["pt-BR", "pt-AO"])).toEqual({ kind: "unmatched" });
  });

  it("refuses to guess when two configured locales extend the tag", () => {
    expect(matchLanguageTag("pt", ["pt-BR", "pt-AO"])).toEqual({
      kind: "ambiguous",
      candidates: ["pt-BR", "pt-AO"],
    });
  });

  it("refuses to guess when two configured locales are both prefixes of the tag", () => {
    expect(matchLanguageTag("de-CH-1901", ["de", "de-CH"])).toEqual({
      kind: "ambiguous",
      candidates: ["de", "de-CH"],
    });
  });

  it("marks an exact match as exact and a prefix match as a fallback", () => {
    expect(matchLanguageTag("DE", ["de"])).toMatchObject({ exact: true });
    expect(matchLanguageTag("de-CH", ["de"])).toMatchObject({ exact: false });
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

  it("matches a three-subtag tag on its language when that language is the only prefix", () => {
    expect(matchLanguageTag("zh-Hans-CN", ["zh"])).toMatchObject({ kind: "matched", locale: "zh" });
  });

  it("matches across separators and case on the prefix path too", () => {
    expect(matchLanguageTag("sr_latn_rs", ["sr-Latn"])).toMatchObject({
      kind: "matched",
      locale: "sr-Latn",
    });
  });
});
