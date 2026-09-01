import { describe, expect, it } from "vitest";
import { chunkTextsForGoogleTranslate, GOOGLE_TRANSLATE_MAX_TEXT_PAYLOAD_BYTES } from "./limits.js";

describe("chunkTextsForGoogleTranslate: byte-size cap", () => {
  it("keeps texts together when their combined size fits the payload budget", () => {
    const texts = ["a".repeat(1000), "b".repeat(1000)];
    expect(chunkTextsForGoogleTranslate(texts)).toEqual([texts]);
  });

  it("splits when the combined byte size would exceed the payload budget", () => {
    const big = "x".repeat(GOOGLE_TRANSLATE_MAX_TEXT_PAYLOAD_BYTES - 5);
    const texts = [big, "small-tail"];
    const chunks = chunkTextsForGoogleTranslate(texts);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toEqual([big]);
    expect(chunks[1]).toEqual(["small-tail"]);
  });

  it("places a single oversized text alone rather than dropping or corrupting it", () => {
    const oversized = "y".repeat(GOOGLE_TRANSLATE_MAX_TEXT_PAYLOAD_BYTES + 1000);
    const chunks = chunkTextsForGoogleTranslate([oversized, "after"]);
    expect(chunks).toEqual([[oversized], ["after"]]);
  });

  it("preserves order across chunk boundaries", () => {
    const texts = Array.from({ length: 20 }, (_, i) =>
      "z".repeat(Math.floor(GOOGLE_TRANSLATE_MAX_TEXT_PAYLOAD_BYTES / 8) + i),
    );
    const chunks = chunkTextsForGoogleTranslate(texts);
    expect(chunks.flat()).toEqual(texts);
    expect(chunks.length).toBeGreaterThan(1);
  });
});

describe("chunkTextsForGoogleTranslate: edge cases", () => {
  it("returns no chunks for an empty input", () => {
    expect(chunkTextsForGoogleTranslate([])).toEqual([]);
  });

  it("keeps a small batch in a single chunk", () => {
    const texts = ["one", "two", "three"];
    expect(chunkTextsForGoogleTranslate(texts)).toEqual([texts]);
  });
});
