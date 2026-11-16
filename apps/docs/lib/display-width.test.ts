import { describe, expect, it } from "vitest";
import { displayWidth, SPACELESS_SNIPPET_WIDTH, snippetLength } from "./display-width";

describe("displayWidth", () => {
  it("counts Latin letters, digits and spaces as one unit", () => {
    expect(displayWidth("Verbatra 0.13")).toBe(13);
    expect(displayWidth("")).toBe(0);
  });

  it("counts Han characters as two units", () => {
    expect(displayWidth("翻译")).toBe(4);
    expect(displayWidth("Verbatra 翻译")).toBe(13);
  });

  it("counts fullwidth forms, CJK punctuation, kana and Hangul as two units", () => {
    expect(displayWidth("，。")).toBe(4);
    expect(displayWidth("（Ａ）")).toBe(6);
    expect(displayWidth("かな")).toBe(4);
    expect(displayWidth("한글")).toBe(4);
  });

  it("counts a supplementary-plane Han character once, as two units", () => {
    expect(displayWidth("\u{20000}")).toBe(2);
  });

  it("counts halfwidth and accented Latin characters as one unit", () => {
    expect(displayWidth("ｱ")).toBe(1);
    expect(displayWidth("Übersetzung")).toBe(11);
  });

  it("puts the boundaries of a wide range on the right side", () => {
    expect(displayWidth("\u10ff")).toBe(1);
    expect(displayWidth("\u1100")).toBe(2);
    expect(displayWidth("\u9fff")).toBe(2);
    expect(displayWidth("\ua4cf")).toBe(2);
    expect(displayWidth("\ua4d0")).toBe(1);
  });
});

describe("snippetLength", () => {
  it("keeps the plain character count for spaced locales", () => {
    expect(snippetLength("en", "翻译 ab")).toBe(5);
    expect(snippetLength("de", "Übersetzung")).toBe(11);
  });

  it("measures display width for a spaceless locale", () => {
    expect(snippetLength("zh-CN", "翻译 ab")).toBe(7);
  });

  it("pins the shared spaceless limits", () => {
    expect(SPACELESS_SNIPPET_WIDTH).toEqual({ titleMax: 60, descriptionMax: 160 });
  });
});
