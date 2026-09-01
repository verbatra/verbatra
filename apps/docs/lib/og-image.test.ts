import { describe, expect, it } from "vitest";
import { titleFontSize } from "./og-image";

describe("titleFontSize", () => {
  it("uses the largest size for a short title", () => {
    expect(titleFontSize("verbatra")).toBe(66);
  });

  it("keeps the largest size at the lower boundary", () => {
    expect(titleFontSize("a".repeat(44))).toBe(66);
  });

  it("drops to the medium size just past the lower boundary", () => {
    expect(titleFontSize("a".repeat(45))).toBe(54);
  });

  it("keeps the medium size at the upper boundary", () => {
    expect(titleFontSize("a".repeat(70))).toBe(54);
  });

  it("drops to the smallest size just past the upper boundary", () => {
    expect(titleFontSize("a".repeat(71))).toBe(44);
  });

  it("uses the smallest size for a very long title", () => {
    expect(titleFontSize("a".repeat(120))).toBe(44);
  });
});
