import { describe, expect, it } from "vitest";
import { hasUnsafeRepeat } from "./pattern-safety.js";

describe("hasUnsafeRepeat", () => {
  it.each([
    "(a+)+$",
    "(a*)*",
    "(?:\\w+\\s?)+$",
    "(a|aa)*b",
    "(?<word>x+){2,}",
    "((ab)+)+",
    "(a{1,3})+",
    "(?:a|b)*",
  ])("rejects %s", (source) => {
    expect(hasUnsafeRepeat(source)).toBe(true);
  });

  it.each([
    "Falcon",
    "Project\\s+Falcon",
    "(?:Falcon|Osprey)",
    "(ab)+",
    "(a+)?",
    "(a+){1}",
    "[(+)]+",
    "\\(a+\\)+",
    "(?<=x)a+",
    "(?!a+)b",
    "a{2}",
  ])("accepts %s", (source) => {
    expect(hasUnsafeRepeat(source)).toBe(false);
  });
});
