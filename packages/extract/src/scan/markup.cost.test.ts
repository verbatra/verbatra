import { describe, expect, it, vi } from "vitest";
import { readMarkup } from "./markup.js";
import { scanSource } from "./tokenize.js";

const counter = vi.hoisted(() => ({ reads: 0 }));

vi.mock("./tokenize.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("./tokenize.js")>();
  return {
    ...original,
    advance: (...args: Parameters<typeof original.advance>) => {
      counter.reads += 1;
      return original.advance(...args);
    },
    charAt: (...args: Parameters<typeof original.charAt>) => {
      counter.reads += 1;
      return original.charAt(...args);
    },
  };
});

function characterReads(unit: string, length: number): number {
  counter.reads = 0;
  scanSource(unit.repeat(Math.ceil(length / unit.length)).slice(0, length), { markup: readMarkup });
  return counter.reads;
}

describe("readMarkup: cost on input that never closes type arguments", () => {
  it.each([
    ["a parenthesized tag with type arguments", "(<a<"],
    ["an assigned tag with type arguments", "= <a<"],
    ["a child tag with type arguments", "<p><Foo<Bar "],
  ])("reads a bounded number of characters per character for %s", (_label, unit) => {
    const half = characterReads(unit, 100_000);
    const full = characterReads(unit, 200_000);

    expect(full).toBeLessThan(200_000 * 100);
    expect(full).toBeLessThan(half * 2.2);
  });
});

describe("readMarkup: nesting depth", () => {
  it.each([
    ["repeated generic function types", "type Fn = <T>(x: T) => T;\n", 20_000],
    ["nested unclosed elements", "<a>", 50_000],
  ])("reads %s without exhausting the stack", (_label, unit, count) => {
    const result = scanSource(`const a = ${unit.repeat(count)}`, { markup: readMarkup });

    expect(result.truncated).toBe(false);
  });
});
