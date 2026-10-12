import { describe, expect, it } from "vitest";
import { formatCompactNumber } from "@/lib/compact-number";

describe("formatCompactNumber", () => {
  it.each([
    ["en", 950, /^950$/],
    ["en", 1234, /^1\.2K$/],
    ["en", 15600, /^15\.6K$/],
    ["en", 2_300_000, /^2\.3M$/],
    ["de", 15600, /^15\.600$/],
    ["fr", 1234, /^1,2\sk$/u],
    ["es", 1234, /^1,2\smil$/u],
  ])("formats %s %d in that locale's compact notation", (locale, value, expected) => {
    expect(formatCompactNumber(value, locale)).toMatch(expected);
  });
});
