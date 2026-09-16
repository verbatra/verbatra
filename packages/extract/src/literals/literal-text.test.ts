import { describe, expect, it } from "vitest";
import {
  boundLiteralText,
  decodeCharacterReferences,
  hasLetters,
  isProseLike,
  isUrlLike,
  MAX_LITERAL_TEXT_LENGTH,
} from "./literal-text.js";

describe("literal text predicates", () => {
  it("finds letters in any script and ignores character references", () => {
    expect(hasLetters("Grüße")).toBe(true);
    expect(hasLetters("こんにちは")).toBe(true);
    expect(hasLetters("&nbsp;&amp;&#x2192;")).toBe(false);
  });

  it("recognises absolute, scheme, relative, and anchor URLs without whitespace", () => {
    for (const url of [
      "https://a.example/x",
      "mailto:a@b.c",
      "www.example.com",
      "./a",
      "/a/b",
      "#top",
    ]) {
      expect(isUrlLike(url)).toBe(true);
    }
    expect(isUrlLike("see https://a.example")).toBe(false);
  });

  it("treats two lettered words as prose unless they read as a class list", () => {
    expect(isProseLike("Welcome back")).toBe(true);
    expect(isProseLike("a well-known issue")).toBe(true);
    expect(isProseLike("Welcome")).toBe(false);
    expect(isProseLike("px-2 py-1 flex")).toBe(false);
  });
});

describe("boundLiteralText", () => {
  it("keeps a short text whole", () => {
    expect(boundLiteralText("Hello")).toEqual({ text: "Hello", truncated: false });
  });

  it("cuts a long text to the bound by characters, not code units", () => {
    const long = "\u{1F600}".repeat(MAX_LITERAL_TEXT_LENGTH + 20);
    const bounded = boundLiteralText(long);

    expect(bounded.truncated).toBe(true);
    expect(Array.from(bounded.text)).toHaveLength(MAX_LITERAL_TEXT_LENGTH + 3);
    expect(bounded.text.endsWith("...")).toBe(true);
  });
});

describe("decodeCharacterReferences", () => {
  it("decodes the common named references and numeric references", () => {
    expect(decodeCharacterReferences("Tom &amp; Jerry")).toBe("Tom & Jerry");
    expect(decodeCharacterReferences("&lt;b&gt; &quot;hi&quot; &apos;x&#39;")).toBe(
      "<b> \"hi\" 'x'",
    );
    expect(decodeCharacterReferences("a&nbsp;b &#8594; &#x2192;")).toBe("a\u00a0b \u2192 \u2192");
  });

  it.each([
    ["nbsp", "\u00a0"],
    ["amp", "&"],
    ["lt", "<"],
    ["gt", ">"],
    ["quot", '"'],
    ["apos", "'"],
    ["rsquo", "\u2019"],
    ["lsquo", "\u2018"],
    ["rdquo", "\u201d"],
    ["ldquo", "\u201c"],
    ["sbquo", "\u201a"],
    ["bdquo", "\u201e"],
    ["hellip", "\u2026"],
    ["mdash", "\u2014"],
    ["ndash", "\u2013"],
    ["copy", "\u00a9"],
    ["reg", "\u00ae"],
    ["trade", "\u2122"],
    ["deg", "\u00b0"],
    ["euro", "\u20ac"],
    ["pound", "\u00a3"],
    ["yen", "\u00a5"],
    ["cent", "\u00a2"],
    ["sect", "\u00a7"],
    ["para", "\u00b6"],
    ["middot", "\u00b7"],
    ["bull", "\u2022"],
    ["laquo", "\u00ab"],
    ["raquo", "\u00bb"],
    ["times", "\u00d7"],
    ["divide", "\u00f7"],
    ["plusmn", "\u00b1"],
    ["frac12", "\u00bd"],
    ["frac14", "\u00bc"],
    ["frac34", "\u00be"],
    ["iexcl", "\u00a1"],
    ["iquest", "\u00bf"],
    ["shy", "\u00ad"],
    ["Aacute", "\u00c1"],
    ["aacute", "\u00e1"],
    ["Acirc", "\u00c2"],
    ["acirc", "\u00e2"],
    ["Agrave", "\u00c0"],
    ["agrave", "\u00e0"],
    ["Auml", "\u00c4"],
    ["auml", "\u00e4"],
    ["Ccedil", "\u00c7"],
    ["ccedil", "\u00e7"],
    ["Eacute", "\u00c9"],
    ["eacute", "\u00e9"],
    ["Ecirc", "\u00ca"],
    ["ecirc", "\u00ea"],
    ["Egrave", "\u00c8"],
    ["egrave", "\u00e8"],
    ["iacute", "\u00ed"],
    ["icirc", "\u00ee"],
    ["Ntilde", "\u00d1"],
    ["ntilde", "\u00f1"],
    ["Oacute", "\u00d3"],
    ["oacute", "\u00f3"],
    ["ocirc", "\u00f4"],
    ["Ouml", "\u00d6"],
    ["ouml", "\u00f6"],
    ["szlig", "\u00df"],
    ["uacute", "\u00fa"],
    ["ucirc", "\u00fb"],
    ["ugrave", "\u00f9"],
    ["Uuml", "\u00dc"],
    ["uuml", "\u00fc"],
  ])("decodes the named reference &%s;", (name, expected) => {
    expect(decodeCharacterReferences(`a&${name};b`)).toBe(`a${expected}b`);
  });

  it("leaves an unknown or out-of-range reference as written", () => {
    expect(decodeCharacterReferences("&copy2; &unknown; &#x110000; &#0;")).toBe(
      "&copy2; &unknown; &#x110000; &#0;",
    );
    expect(decodeCharacterReferences("&constructor; &toString;")).toBe("&constructor; &toString;");
  });
});
