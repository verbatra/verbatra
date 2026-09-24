import { describe, expect, it } from "vitest";
import { characterCount, compareLength, lengthComparisonText } from "./length-compare.js";

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

describe("lengthComparisonText", () => {
  it("names the count and how it compares to the source", () => {
    expect(lengthComparisonText(compareLength("Hello", "Hallo"))).toBe(
      "5 characters, 100% of the source's 5",
    );
    expect(lengthComparisonText(compareLength("Hi", "A"))).toBe(
      "1 character, 50% of the source's 2",
    );
  });

  it("says so when the source is empty", () => {
    expect(lengthComparisonText(compareLength("", "Hallo"))).toBe(
      "5 characters; the source is empty",
    );
  });
});
