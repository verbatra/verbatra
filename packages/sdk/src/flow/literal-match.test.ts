import { describe, expect, it } from "vitest";
import {
  findLiteralMatches,
  type LiteralMatch,
  replacedLength,
  replaceMatches,
} from "./literal-match.js";

function replaceAllLiteral(value: string, find: string, replacement: string, exact = true): string {
  return replaceMatches(value, findLiteralMatches(value, find, exact), replacement);
}

describe("findLiteralMatches: case sensitive", () => {
  it("finds non-overlapping matches from the left", () => {
    expect(findLiteralMatches("aaaa", "aa", true)).toEqual([
      { start: 0, end: 2 },
      { start: 2, end: 4 },
    ]);
  });

  it("finds nothing when the find text is longer than the value", () => {
    expect(findLiteralMatches("ab", "abc", true)).toEqual([]);
  });

  it("does not match across letter case", () => {
    expect(findLiteralMatches("Colour", "colour", true)).toEqual([]);
  });

  it("does not equate Unicode normalization forms", () => {
    const nfc = "café";
    const nfd = "café";
    expect(findLiteralMatches(nfc, nfd, true)).toEqual([]);
    expect(findLiteralMatches(nfd, nfc, true)).toEqual([]);
  });

  it("does not equate a line feed with a carriage return and line feed", () => {
    expect(findLiteralMatches("a\r\nb", "a\nb", true)).toEqual([]);
  });

  it("never matches half of a surrogate pair", () => {
    expect(findLiteralMatches("a😀b", "\ud83d", true)).toEqual([]);
    expect(findLiteralMatches("a😀b", "\ude00", true)).toEqual([]);
    expect(findLiteralMatches("a😀b", "😀", true)).toEqual([{ start: 1, end: 3 }]);
  });

  it("matches an unpaired surrogate that stands alone in the value", () => {
    expect(findLiteralMatches("a\ud83db", "\ud83d", true)).toEqual([{ start: 1, end: 2 }]);
  });
});

describe("findLiteralMatches: case insensitive", () => {
  it("matches across letter case and reports offsets in the original text", () => {
    expect(findLiteralMatches("A Colour, a COLOUR", "colour", false)).toEqual([
      { start: 2, end: 8 },
      { start: 12, end: 18 },
    ]);
  });

  it("keeps offsets right when lower-casing changes the length of a character", () => {
    const value = "İx Colour";
    const matches = findLiteralMatches(value, "colour", false);
    expect(matches).toHaveLength(1);
    const [match] = matches as readonly LiteralMatch[];
    expect(value.slice(match?.start, match?.end)).toBe("Colour");
  });

  it("refuses a match that would start inside one character's lower-case form", () => {
    expect(findLiteralMatches("İ", "̇", false)).toEqual([]);
  });

  it("refuses a match that would end inside one character's lower-case form", () => {
    expect(findLiteralMatches("İ", "i", false)).toEqual([]);
  });

  it("matches a character whose lower-case form is longer than itself in full", () => {
    expect(findLiteralMatches("aİb", "i̇", false)).toEqual([{ start: 1, end: 2 }]);
  });

  it("handles astral characters and lone surrogates without splitting them", () => {
    const value = "\ud800x 😀 X";
    const matches = findLiteralMatches(value, "x", false);
    expect(matches).toEqual([
      { start: 1, end: 2 },
      { start: 6, end: 7 },
    ]);
    expect(findLiteralMatches("😀", "\ud83d", false)).toEqual([]);
  });

  it("finds nothing when the folded find text is longer than the value", () => {
    expect(findLiteralMatches("ab", "ABC", false)).toEqual([]);
  });
});

describe("replaceMatches", () => {
  it.each(["$&", "$1", "$'", "$`", "$$", "$<name>", "\\1"])(
    "inserts the replacement %s verbatim",
    (replacement) => {
      expect(replaceAllLiteral("a-b-c", "-", replacement)).toBe(`a${replacement}b${replacement}c`);
    },
  );

  it("returns the value untouched when nothing matched", () => {
    expect(replaceAllLiteral("abc", "z", "y")).toBe("abc");
  });

  it("works with an empty replacement", () => {
    expect(replaceAllLiteral("a-b-c", "-", "")).toBe("abc");
  });
});

describe("replacedLength", () => {
  it("equals the length of the string replaceMatches builds", () => {
    const value = "x-yy-zzz";
    const matches = findLiteralMatches(value, "-", true);
    expect(replacedLength(value, matches, "<<>>")).toBe(
      replaceMatches(value, matches, "<<>>").length,
    );
    expect(replacedLength(value, matches, "")).toBe(6);
  });
});
