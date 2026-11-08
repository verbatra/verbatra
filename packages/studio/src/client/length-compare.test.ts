import { describe, expect, it } from "vitest";
import { characterCount, compareLength, lengthSummary } from "./length-compare.js";

describe("characterCount", () => {
  it("counts user-perceived characters, not code units", () => {
    expect(characterCount("Hallo")).toBe(5);
    expect(characterCount("👍🏽 ok")).toBe(4);
    expect(characterCount("é")).toBe(1);
    expect(characterCount("")).toBe(0);
  });
});

describe("compareLength", () => {
  it("relates the translation's length to the source's as a rounded percentage", () => {
    expect(compareLength("Hello", "Hallo zusammen")).toEqual({
      source: 5,
      translation: 14,
      percentOfSource: 280,
    });
  });

  it("gives no percentage against an empty source", () => {
    expect(compareLength("", "Hallo").percentOfSource).toBeNull();
  });
});

describe("lengthSummary", () => {
  it("names the count and how it compares to the source in a few words", () => {
    expect(lengthSummary(compareLength("Hello", "Hallo"), undefined)).toEqual({
      text: "5 characters, 100% of source",
      overBudget: false,
    });
    expect(lengthSummary(compareLength("Hi", "A"), undefined).text).toBe(
      "1 character, 50% of source",
    );
  });

  it("drops the ratio when the source is empty", () => {
    expect(lengthSummary(compareLength("", "Hallo"), undefined).text).toBe("5 characters");
  });

  it("counts against the key's budget and flags a value over it", () => {
    expect(lengthSummary(compareLength("Hello", "Hallo"), 5)).toEqual({
      text: "5 of 5 characters, 100% of source",
      overBudget: false,
    });
    expect(lengthSummary(compareLength("Hello", "Hallo!"), 5)).toEqual({
      text: "6 of 5 characters, 120% of source, over budget",
      overBudget: true,
    });
  });
});

describe("lengthSummary agrees with the review flag on what a character is", () => {
  const family = String.fromCodePoint(0x1f468, 0x200d, 0x1f469, 0x200d, 0x1f467);
  const decomposed = `cafe${String.fromCodePoint(0x301)}`;

  it("counts a ZWJ emoji sequence as one character, so one is within a budget of 1 and over 0", () => {
    expect(characterCount(family)).toBe(1);
    expect(lengthSummary(compareLength("Hi", family), 1).overBudget).toBe(false);
    expect(lengthSummary(compareLength("Hi", family), 0).overBudget).toBe(true);
  });

  it("counts a base letter and its combining mark as one character, so four are within 4 and over 3", () => {
    expect(characterCount(decomposed)).toBe(4);
    expect(lengthSummary(compareLength("Hi", decomposed), 4).overBudget).toBe(false);
    expect(lengthSummary(compareLength("Hi", decomposed), 3).overBudget).toBe(true);
  });
});
