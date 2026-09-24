import { describe, expect, it } from "vitest";
import { extractXliffPlaceholders } from "./placeholders.js";

describe("extractXliffPlaceholders", () => {
  it("extracts single-brace text interpolation", () => {
    expect(extractXliffPlaceholders("Hello {name}, you have {count} items")).toEqual([
      "{name}",
      "{count}",
    ]);
  });

  it("extracts inline placeholder element opening tags by their id-bearing tag", () => {
    expect(extractXliffPlaceholders('Click <x id="1"/> then <g id="2">here</g>')).toEqual([
      '<x id="1"/>',
      '<g id="2">',
    ]);
  });

  it("does not match an element whose name merely starts with a placeholder letter", () => {
    expect(extractXliffPlaceholders("<source>plain</source>")).toEqual([]);
  });

  it("preserves document order and multiplicity across the two token kinds", () => {
    expect(extractXliffPlaceholders('{a} <ph id="p"/> {a}')).toEqual([
      "{a}",
      '<ph id="p"/>',
      "{a}",
    ]);
  });

  it("returns an empty array for plain text", () => {
    expect(extractXliffPlaceholders("no placeholders here")).toEqual([]);
  });
});

const REGEX_ORACLE = /<(?:x|g|bx|ex|bpt|ept|ph|it|mrk|pc|sc|ec|sm|em|cp)\b[^<>]*>|\{[^{}]+\}/g;
const ALPHABET = ["<", ">", "{", "}", "x", "p", "h", " ", "/", "1"] as const;

function allStrings(maxLength: number): string[] {
  const out: string[] = [""];
  let frontier: string[] = [""];
  for (let length = 1; length <= maxLength; length += 1) {
    frontier = frontier.flatMap((prefix) => ALPHABET.map((char) => prefix + char));
    out.push(...frontier);
  }
  return out;
}

function countCharacterReads<T>(run: () => T): { readonly result: T; readonly reads: number } {
  const { charCodeAt } = String.prototype;
  let reads = 0;
  String.prototype.charCodeAt = function (this: string, index: number): number {
    reads += 1;
    return charCodeAt.call(this, index);
  };
  try {
    return { result: run(), reads };
  } finally {
    String.prototype.charCodeAt = charCodeAt;
  }
}

describe("extractXliffPlaceholders: agreement with a non-overlapping pattern", () => {
  it("agrees with the pattern on every short string over the relevant alphabet", () => {
    const disagreements = allStrings(5).filter(
      (value) =>
        JSON.stringify(extractXliffPlaceholders(value)) !==
        JSON.stringify(value.match(REGEX_ORACLE) ?? []),
    );
    expect(disagreements).toEqual([]);
  });

  it.each([
    ['<bpt id="1">a</bpt><ept id="1"/>', ['<bpt id="1">', '<ept id="1"/>']],
    ['<pc id="1">b</pc> <cp hex="0001"/>', ['<pc id="1">', '<cp hex="0001"/>']],
    ["<x-y/> <xy/> <x1/>", ["<x-y/>"]],
    ["{a<x/>} <x {b}>", ["{a<x/>}", "<x {b}>"]],
    ["{{name}} {} {", ["{name}"]],
    ["<x <x/>", ["<x/>"]],
  ])("extracts from %j", (value, expected) => {
    expect(extractXliffPlaceholders(value)).toEqual(expected);
  });
});

describe("extractXliffPlaceholders: bounded work", () => {
  it.each([
    ["unclosed inline tags", "<x".repeat(40_000)],
    ["unclosed inline tags with attributes", '<ph id="1" '.repeat(10_000)],
    ["unclosed braces", "{a".repeat(40_000)],
    ["a long tag body without a close", `<g ${"a".repeat(80_000)}`],
    ["closed tags", '<x id="1"/>'.repeat(10_000)],
  ])("reads each character a constant number of times for %s", (_label, value) => {
    const { reads } = countCharacterReads(() => extractXliffPlaceholders(value));
    expect(reads).toBeGreaterThanOrEqual(value.length);
    expect(reads).toBeLessThanOrEqual(value.length * 4 + 8);
  });
});
