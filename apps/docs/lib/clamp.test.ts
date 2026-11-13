import { describe, expect, it } from "vitest";
import { clamp } from "./clamp";

describe("clamp", () => {
  it("keeps a value inside the range and pulls an outside value to the nearest bound", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-3, 0, 10)).toBe(0);
    expect(clamp(42, 0, 10)).toBe(10);
  });
});
