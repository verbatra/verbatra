import { cpuScalingRatio, LINEAR_MAX_RATIO } from "@verbatra/config/scaling";
import { describe, expect, it } from "vitest";
import { extractSingleBraceTokens } from "./tokens.js";

describe("extractSingleBraceTokens", () => {
  it("extracts a named token", () => {
    expect(extractSingleBraceTokens("hello {name}")).toEqual(["{name}"]);
  });

  it("extracts a numeric token", () => {
    expect(extractSingleBraceTokens("{0} and {1}")).toEqual(["{0}", "{1}"]);
  });

  it("normalizes whitespace inside the braces", () => {
    expect(extractSingleBraceTokens("hi { name }")).toEqual(["{name}"]);
  });

  it("ignores double-brace interpolation entirely", () => {
    expect(extractSingleBraceTokens("Hello {{name}}")).toEqual([]);
  });

  it("ignores brace runs that hold no key-shaped content", () => {
    expect(extractSingleBraceTokens("use {curly braces} here")).toEqual([]);
    expect(extractSingleBraceTokens('$t(common.foo, {"count": 3})')).toEqual([]);
  });

  it("stays linear on adversarial input", () => {
    const hostile = "{".repeat(200_000);
    expect(extractSingleBraceTokens(hostile)).toEqual([]);
    expect(cpuScalingRatio(extractSingleBraceTokens, "{".repeat(25_000), hostile)).toBeLessThan(
      LINEAR_MAX_RATIO,
    );
  });
});
