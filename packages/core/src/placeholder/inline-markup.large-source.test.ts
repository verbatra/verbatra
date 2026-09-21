import { describe, expect, it } from "vitest";
import { compareInlineMarkup } from "./inline-markup.js";

describe("compareInlineMarkup: a source with many tags is compared like any other", () => {
  const BREAKS = "<br>".repeat(257);

  it("refuses a tag invented beside more than 256 source tags", () => {
    const result = compareInlineMarkup(BREAKS, `${BREAKS}<img src=x onerror=alert(1)>`);
    expect(result.matches).toBe(false);
    expect(result.extra).toEqual(["<img onerror src>"]);
  });

  it("accepts such a source translated as itself", () => {
    expect(compareInlineMarkup(BREAKS, BREAKS).matches).toBe(true);
  });

  it("refuses dropping one of four hundred pairs", () => {
    const result = compareInlineMarkup("<b>x</b>".repeat(400), "<b>x</b>".repeat(399));
    expect(result.matches).toBe(false);
    expect(result.missing).toEqual(["</b>", "<b>"]);
  });
});

describe("compareInlineMarkup: the candidate ceiling grows with the source", () => {
  it("allows a candidate up to twice the source's tags and constructs", () => {
    const source = "<b>x</b>".repeat(200);
    const candidate = "<b>x</b>".repeat(400);
    const result = compareInlineMarkup(source, candidate);
    expect(result.tagLimitExceeded).toBeUndefined();
    expect(result.extra).toHaveLength(400);
  });

  it("refuses a candidate past twice the source's tags and constructs, naming that limit", () => {
    const source = "<b>x</b>".repeat(200);
    expect(compareInlineMarkup(source, `${"<b>x</b>".repeat(400)}<br>`)).toEqual({
      matches: false,
      missing: [],
      extra: [],
      malformed: false,
      tagLimitExceeded: 800,
    });
  });

  it("keeps 256 as the floor for a small source", () => {
    expect(compareInlineMarkup("<b>x</b>", `x${"<i></i>".repeat(200)}`).tagLimitExceeded).toBe(256);
  });
});

const SCALE = 8;
const LARGE_TAG_COUNT = 120_000;
const GROWTH_CEILING = SCALE * 1.1;
const STEPS_PER_CHARACTER_CEILING = 16;

const LINEAR_ARRAY_METHODS = [
  "filter",
  "map",
  "find",
  "findIndex",
  "some",
  "every",
  "flat",
  "indexOf",
  "lastIndexOf",
  "includes",
  "splice",
] as const;

type LinearArrayMethod = (typeof LINEAR_ARRAY_METHODS)[number];

interface CountedComparison {
  readonly steps: number;
  readonly identicalMatches: boolean;
  readonly unmarkedSourceMatches: boolean;
}

function patchArrayMethod(method: LinearArrayMethod, charge: (length: number) => void): () => void {
  const prototype = Array.prototype as unknown as Record<string, unknown>;
  const original = prototype[method] as (this: unknown[], ...args: unknown[]) => unknown;
  prototype[method] = function (this: unknown[], ...args: unknown[]): unknown {
    charge(this.length + 1);
    return original.apply(this, args);
  };
  return () => {
    prototype[method] = original;
  };
}

function countComparisonSteps(value: string): CountedComparison {
  const { indexOf, charCodeAt } = String.prototype;
  let steps = 0;
  const charge = (amount: number): void => {
    steps += amount;
  };
  String.prototype.indexOf = function (this: string, needle: string, from?: number): number {
    const start = from ?? 0;
    const found = indexOf.call(this, needle, start);
    steps += (found === -1 ? this.length : found) - start + 1;
    return found;
  };
  String.prototype.charCodeAt = function (this: string, index: number): number {
    steps += 1;
    return charCodeAt.call(this, index);
  };
  const restoreArrayMethods = LINEAR_ARRAY_METHODS.map((method) =>
    patchArrayMethod(method, charge),
  );
  try {
    const identicalMatches = compareInlineMarkup(value, value).matches;
    const unmarkedSourceMatches = compareInlineMarkup("Hallo", value).matches;
    return { steps, identicalMatches, unmarkedSourceMatches };
  } finally {
    for (const restore of restoreArrayMethods) {
      restore();
    }
    String.prototype.indexOf = indexOf;
    String.prototype.charCodeAt = charCodeAt;
  }
}

describe("compareInlineMarkup: comparison work stays proportional to the number of tags", () => {
  it.each([
    ["deeply nested pairs", (n: number) => `${"<b>".repeat(n / 2)}x${"</b>".repeat(n / 2)}`],
    ["unclosed openers", (n: number) => "<i>".repeat(n)],
    ["closing tags with no opener", (n: number) => `<b>x</b>${"</i>".repeat(n)}`],
  ])("compares %s in steps that grow linearly with the tag count", (_label, build) => {
    const smallValue = build(LARGE_TAG_COUNT / SCALE);
    const largeValue = build(LARGE_TAG_COUNT);
    const small = countComparisonSteps(smallValue);
    const large = countComparisonSteps(largeValue);

    expect(small.identicalMatches).toBe(true);
    expect(small.unmarkedSourceMatches).toBe(false);
    expect(large.identicalMatches).toBe(true);
    expect(large.unmarkedSourceMatches).toBe(false);
    expect(large.steps).toBeGreaterThanOrEqual(largeValue.length);
    expect(large.steps).toBeLessThanOrEqual(small.steps * GROWTH_CEILING);
    expect(large.steps).toBeLessThanOrEqual(largeValue.length * STEPS_PER_CHARACTER_CEILING);
  });
}, 60_000);
