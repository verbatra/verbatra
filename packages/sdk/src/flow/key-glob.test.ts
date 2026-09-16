import { describe, expect, it } from "vitest";
import { type GlobMeter, matchesKeyGlob } from "./key-glob.js";

describe("matchesKeyGlob", () => {
  it.each([
    ["emails.*", "emails.welcome", true],
    ["emails.*", "emails.", true],
    ["emails.*", "email.welcome", false],
    ["*", "", true],
    ["", "", true],
    ["", "a", false],
    ["a*b*c", "aXXbYYc", true],
    ["a*b*c", "aXXbYY", false],
    ["*.title", "nav.home.title", true],
    ["a.b", "aXb", false],
    ["a**b", "ab", true],
    ["nav.*.label", "nav.home.label", true],
    ["nav.*.label", "nav.home.title", false],
  ])("pattern %j against %j is %s", (pattern, key, expected) => {
    expect(matchesKeyGlob(pattern, key)).toBe(expected);
  });

  it("matches a 5000-character key against seven wildcards in steps bounded by key times pattern length", () => {
    const key = "a".repeat(5000);
    const pattern = "*a*a*a*a*a*a*b";
    const meter: GlobMeter = { steps: 0 };

    expect(matchesKeyGlob(pattern, key, meter)).toBe(false);
    expect(meter.steps).toBeGreaterThan(0);
    expect(meter.steps).toBeLessThanOrEqual((key.length + 1) * (pattern.length + 1));
  });
});
