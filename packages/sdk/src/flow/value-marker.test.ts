import { describe, expect, it } from "vitest";
import { createValueMarker } from "./value-marker.js";

describe("createValueMarker", () => {
  it("marks a value with its character count and its hash, never its text", () => {
    const marker = createValueMarker(new Uint8Array([1, 2, 3]));

    const marked = marker.mark("Grüße 👋");

    expect(marked).toBe(`[redacted length=7 hash=${marker.hash("Grüße 👋")}]`);
    expect(marked).not.toContain("Grüße");
    expect(marker.hash("Grüße 👋")).toMatch(/^[0-9a-f]{16}$/);
  });

  it("hashes the same value alike within one marker and differently under another salt", () => {
    const first = createValueMarker(new Uint8Array([1]));
    const second = createValueMarker(new Uint8Array([2]));

    expect(first.hash("Hallo")).toBe(first.hash("Hallo"));
    expect(first.hash("Hallo")).not.toBe(first.hash("Hallo!"));
    expect(first.hash("Hallo")).not.toBe(second.hash("Hallo"));
  });

  it("hashes two Unicode normalizations of one value alike", () => {
    const marker = createValueMarker(new Uint8Array([9]));

    expect(marker.hash("Café")).toBe(marker.hash("Café"));
  });

  it("draws a random salt when none is given", () => {
    expect(createValueMarker().hash("Hallo")).not.toBe(createValueMarker().hash("Hallo"));
  });
});
