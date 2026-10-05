import { cpuScalingRatio, LINEAR_MAX_RATIO, LINEAR_SCALE } from "@verbatra/config/scaling";
import { describe, expect, it } from "vitest";
import { foreignPlaceholderTokens, PLACEHOLDER_SYNTAXES } from "./foreign-tokens.js";

const LENGTH = 200_000;

function repeatedTo(unit: string, length: number): string {
  return unit.repeat(Math.ceil(length / unit.length)).slice(0, length);
}

describe("foreignPlaceholderTokens on a long value without whitespace", () => {
  it.each([
    "a",
    "a://",
    "://",
    "%",
    "%1$",
    "{",
    "{a",
    "{{a,",
    "{a,",
    "${a",
    "%{a",
    "%(a",
    "{a}",
    "a$",
    "{名",
    "{名,",
    "{名前}",
    "{é\u0301",
    "{\u0663",
  ])("stays linear on %j repeated to 200k characters", (unit) => {
    const small = repeatedTo(unit, LENGTH / LINEAR_SCALE);
    const large = repeatedTo(unit, LENGTH);
    const scanForeign = (value: string) => foreignPlaceholderTokens(value, []);
    const scanNative = (value: string) => foreignPlaceholderTokens(value, PLACEHOLDER_SYNTAXES);

    expect(cpuScalingRatio(scanForeign, small, large)).toBeLessThan(LINEAR_MAX_RATIO);
    expect(cpuScalingRatio(scanNative, small, large)).toBeLessThan(LINEAR_MAX_RATIO);
  });

  it("still blanks a whole URL run before scanning it", () => {
    const value = `${"x".repeat(LENGTH)}://{id}/%s`;

    expect(foreignPlaceholderTokens(value, [])).toEqual([]);
    expect(foreignPlaceholderTokens(`${value} {id}`, [])).toEqual(["{id}"]);
  });
});

describe("foreignPlaceholderTokens on an unclosed placeholder followed by whitespace", () => {
  it.each([
    ["{{a,", " "],
    ["{{a, ", " "],
    ["{{a,", "\n"],
    ["{{a,\n", "\t"],
    ["{{ a ,", " "],
    ["{{-a,", " "],
    ["{{a,", " ,"],
    ["{{a", " "],
    ["{ a,", " "],
    ["{a, ", " "],
    ["{名, ", " "],
    ["{ número,", "\n"],
  ])("stays linear on %j followed by %j up to 200k characters", (prefix, filler) => {
    const small = prefix + repeatedTo(filler, LENGTH / LINEAR_SCALE);
    const large = prefix + repeatedTo(filler, LENGTH);
    const scanForeign = (value: string) => foreignPlaceholderTokens(value, []);

    expect(cpuScalingRatio(scanForeign, small, large)).toBeLessThan(LINEAR_MAX_RATIO);
  });
});
