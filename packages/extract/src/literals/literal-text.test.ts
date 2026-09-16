import { describe, expect, it } from "vitest";
import {
  boundLiteralText,
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
