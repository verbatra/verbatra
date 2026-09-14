import { describe, expect, it } from "vitest";
import { resolveDryRun } from "./translate-project.js";

describe("resolveDryRun", () => {
  it.each([
    { input: {}, expected: false },
    { input: { dryRun: false }, expected: false },
    { input: { estimate: false }, expected: false },
    { input: { dryRun: false, estimate: false }, expected: false },
    { input: { dryRun: true }, expected: true },
    { input: { estimate: true }, expected: true },
    { input: { dryRun: true, estimate: true }, expected: true },
    { input: { dryRun: false, estimate: true }, expected: true },
    { input: { dryRun: true, estimate: false }, expected: true },
    { input: { dryRun: undefined, estimate: undefined }, expected: false },
  ])("resolves $input to $expected", ({ input, expected }) => {
    expect(resolveDryRun(input)).toBe(expected);
  });
});
