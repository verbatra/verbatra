import { cpuScalingRatio, LINEAR_MAX_RATIO, LINEAR_SCALE } from "@verbatra/config/scaling";
import { describe, expect, it } from "vitest";
import { maskPlaceholders } from "./placeholder-protection.js";

const PLACEHOLDER_COUNT = 25_000;

function numberedPlaceholders(count: number): readonly string[] {
  return Array.from({ length: count }, (_, index) => `{${index}}`);
}

describe("maskPlaceholders with many distinct placeholders", () => {
  it("masks each one in order", () => {
    const placeholders = numberedPlaceholders(PLACEHOLDER_COUNT);
    const value = placeholders.join("");

    const masked = maskPlaceholders(value, placeholders);

    expect(masked?.originals).toEqual(placeholders);
    expect(masked?.text).toBe(value);
  });

  it("stays linear in the value, not in the value times the placeholder count", () => {
    const small = numberedPlaceholders(PLACEHOLDER_COUNT / LINEAR_SCALE);
    const large = numberedPlaceholders(PLACEHOLDER_COUNT);
    const mask = (placeholders: readonly string[]) =>
      maskPlaceholders(placeholders.join(""), placeholders);

    expect(cpuScalingRatio(mask, small, large)).toBeLessThan(LINEAR_MAX_RATIO);
  });

  it("prefers the longest placeholder that starts at a position", () => {
    expect(maskPlaceholders("{10}{1}", ["{1}", "{10}"])?.originals).toEqual(["{10}", "{1}"]);
    expect(maskPlaceholders("{{a}} {a}", ["{a}", "{{a}}"])?.text).toBe("{0} {1}");
  });
});
