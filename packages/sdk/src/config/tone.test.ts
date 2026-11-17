import { describe, expect, it } from "vitest";
import { toneForLocale } from "./tone.js";

describe("toneForLocale", () => {
  it("returns undefined when no tone is configured", () => {
    expect(toneForLocale(undefined, "de")).toBeUndefined();
  });

  it("returns a scalar tone for every locale", () => {
    expect(toneForLocale("informal", "ja")).toBe("informal");
    expect(toneForLocale("formal", "de")).toBe("formal");
  });

  it("returns the exact entry of a map for its locale", () => {
    expect(toneForLocale({ default: "informal", ja: "neutral" }, "ja")).toBe("neutral");
  });

  it("falls back to default for a locale the map does not name", () => {
    expect(toneForLocale({ default: "informal", ja: "neutral" }, "de")).toBe("informal");
  });

  it("returns undefined for an unnamed locale of a map without default", () => {
    expect(toneForLocale({ ja: "neutral" }, "de")).toBeUndefined();
  });

  it("matches the locale exactly, with no base-language fallback", () => {
    expect(toneForLocale({ default: "formal", pt: "informal" }, "pt-BR")).toBe("formal");
    expect(toneForLocale({ "pt-BR": "informal" }, "pt")).toBeUndefined();
  });

  it("never reads an inherited property as a tone", () => {
    expect(toneForLocale({ ja: "neutral" }, "constructor")).toBeUndefined();
    expect(toneForLocale({ ja: "neutral" }, "__proto__")).toBeUndefined();
  });
});
