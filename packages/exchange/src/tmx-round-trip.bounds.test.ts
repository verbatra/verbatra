import { describe, expect, it } from "vitest";
import { buildTmx, type TmxExportUnit } from "./build-tmx.js";
import { readTmx } from "./read-tmx.js";
import { DEFAULT_TMX_LIMITS } from "./tmx-limits.js";

function write(units: readonly TmxExportUnit[]): string {
  return buildTmx({ sourceLanguage: "en", toolVersion: "1.0.0", units });
}

function firstPass(value: string): string | undefined {
  return readTmx(write([{ source: value, translations: [{ language: "de", text: value }] }]))
    .units[0]?.segments[0]?.text;
}

function secondPass(value: string): string {
  const once = write([{ source: value, translations: [{ language: "de", text: value }] }]);
  const reread = readTmx(once);
  const twice = write(
    reread.units.map((unit) => ({
      source: unit.segments[0]?.text ?? "",
      translations: unit.segments.slice(1).map((segment) => ({
        language: segment.language,
        text: segment.text,
      })),
    })),
  );
  expect(twice).toBe(once);
  return reread.units[0]?.segments[0]?.text ?? "";
}

const LONE_HIGH = String.fromCharCode(0xd800);

const LONE_LOW = String.fromCharCode(0xdc00);

const NONCHARACTER = String.fromCharCode(0xfffe);

describe("values at the edge of what XML can carry survive two passes", () => {
  it("drops a lone high surrogate on the first write and is then stable", () => {
    expect(firstPass(`before${LONE_HIGH}after`)).toBe("beforeafter");
    expect(secondPass(`before${LONE_HIGH}after`)).toBe("beforeafter");
  });

  it("drops a lone low surrogate on the first write and is then stable", () => {
    expect(firstPass(`before${LONE_LOW}after`)).toBe("beforeafter");
    expect(secondPass(`before${LONE_LOW}after`)).toBe("beforeafter");
  });

  it("drops a noncharacter on the first write and is then stable", () => {
    expect(firstPass(`before${NONCHARACTER}after`)).toBe("beforeafter");
    expect(secondPass(`before${NONCHARACTER}after`)).toBe("beforeafter");
  });

  it("keeps the astral pair a lone surrogate was carved out of", () => {
    expect(firstPass(`a${String.fromCharCode(0xd800, 0xdc00)}b`)).toBe(
      `a${String.fromCharCode(0xd800, 0xdc00)}b`,
    );
  });

  it("carries a whitespace-only value through two passes without collapsing it", () => {
    expect(firstPass(" \t \n ")).toBe(" \t \n ");
    expect(secondPass(" \t \n ")).toBe(" \t \n ");
  });

  it("carries a value of exactly the maximum segment length through two passes", () => {
    const value = "x".repeat(DEFAULT_TMX_LIMITS.maxSegmentLength);

    expect(firstPass(value)).toBe(value);
    expect(secondPass(value)).toBe(value);
  });

  it("refuses a value one character past the maximum segment length", () => {
    const value = "x".repeat(DEFAULT_TMX_LIMITS.maxSegmentLength + 1);

    expect(() => readTmx(write([{ source: value, translations: [] }]))).toThrow(
      /longer than the maximum/,
    );
  });

  it("measures the segment bound after escaping, so an escaped value is not double-counted", () => {
    const value = "&".repeat(DEFAULT_TMX_LIMITS.maxSegmentLength);

    expect(firstPass(value)).toBe(value);
  });
});

describe("the reader's bounds refuse one past the limit and accept exactly the limit", () => {
  it("pins the shipped segment bound, so a change to it is a deliberate decision", () => {
    expect(DEFAULT_TMX_LIMITS.maxSegmentLength).toBe(65536);
    expect(DEFAULT_TMX_LIMITS.maxUnitCount).toBe(200_000);
    expect(DEFAULT_TMX_LIMITS.maxLanguagesPerUnit).toBe(64);
  });

  it("accepts a body holding exactly the maximum unit count", () => {
    const units = [
      { source: "a", translations: [] },
      { source: "b", translations: [] },
    ];
    const limits = { ...DEFAULT_TMX_LIMITS, maxUnitCount: 2 };

    expect(readTmx(write(units), { limits }).units).toHaveLength(2);
    expect(() => readTmx(write([...units, { source: "c", translations: [] }]), { limits })).toThrow(
      /more than the maximum/,
    );
  });

  it("accepts a unit carrying exactly the maximum number of languages", () => {
    const limits = { ...DEFAULT_TMX_LIMITS, maxLanguagesPerUnit: 2 };
    const two = [{ source: "a", translations: [{ language: "de", text: "A" }] }];
    const three = [
      {
        source: "a",
        translations: [
          { language: "de", text: "A" },
          { language: "fr", text: "B" },
        ],
      },
    ];

    expect(readTmx(write(two), { limits }).units[0]?.segments).toHaveLength(2);
    expect(() => readTmx(write(three), { limits })).toThrow(/more than the maximum/);
  });
});
