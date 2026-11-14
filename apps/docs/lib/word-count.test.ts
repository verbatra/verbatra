import { describe, expect, it } from "vitest";
import { countWords } from "@/lib/word-count";

describe("countWords", () => {
  it.each(["en", "de", "es", "fr"])("counts whitespace separated words in %s", (locale) => {
    expect(countWords("  one two\tthree\nfour  ", locale)).toBe(4);
    expect(countWords("", locale)).toBe(0);
    expect(countWords("   ", locale)).toBe(0);
    expect(countWords("hash-based lock file.", locale)).toBe(3);
  });

  it("counts a spaced language by whitespace even when the text holds CJK", () => {
    expect(countWords("北京 上海", "en")).toBe(2);
  });

  it("segments Simplified Chinese, which has no spaces, into words", () => {
    expect(countWords("我们喜欢翻译软件", "zh-CN")).toBeGreaterThan(1);
    expect(countWords("我们喜欢翻译软件", "zh-CN")).toBeLessThan(8);
  });

  it("segments Japanese, which has no spaces, into words", () => {
    expect(countWords("私は翻訳ツールが好きです", "ja")).toBeGreaterThan(1);
  });

  it("ignores punctuation and whitespace segments in a spaceless language", () => {
    expect(countWords("。、 ！", "zh-CN")).toBe(0);
    expect(countWords("", "ja")).toBe(0);
  });

  it("counts Latin words inside a spaceless locale once each", () => {
    expect(countWords("verbatra translate", "zh-CN")).toBe(2);
  });
});
