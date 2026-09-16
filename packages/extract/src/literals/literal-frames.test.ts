import { describe, expect, it } from "vitest";
import { type PositionedToken, scanSource } from "../scan/tokenize.js";
import { type LiteralFrame, updateFrames } from "./literal-frames.js";

function countingTokens(source: string): {
  tokens: readonly PositionedToken[];
  reads: () => number;
} {
  const scanned = scanSource(source).tokens;
  let reads = 0;
  const tokens = new Proxy(scanned, {
    get(target, property, receiver) {
      if (typeof property === "string" && /^\d+$/.test(property)) {
        reads += 1;
      }
      return Reflect.get(target, property, receiver);
    },
  });
  return { tokens, reads: () => reads };
}

function walk(tokens: readonly PositionedToken[]): LiteralFrame[] {
  const frames: LiteralFrame[] = [];
  tokens.forEach((_token, index) => {
    updateFrames(tokens, index, frames);
  });
  return frames;
}

describe("updateFrames: looking back for a call's type arguments", () => {
  it.each([
    ["an arrow before each group", "a => ("],
    ["a greater-than before each group", "a > ("],
  ])("reads a bounded number of tokens per token with %s", (_label, unit) => {
    const { tokens, reads } = countingTokens(unit.repeat(3000));

    walk(tokens);

    expect(reads()).toBeLessThan(tokens.length * 300);
  });

  it("still names the callee behind type arguments", () => {
    const frames = walk(scanSource("useState<Map<string, number>>(").tokens);

    expect(frames).toEqual([
      { kind: "call", callee: "useState", receiver: "", constructed: false },
    ]);
  });

  it("does not read an arrow as the end of type arguments", () => {
    const frames = walk(scanSource("t < max && f((x) => (").tokens);

    expect(frames.at(-1)).toEqual({ kind: "group", bracket: "(" });
  });
});
