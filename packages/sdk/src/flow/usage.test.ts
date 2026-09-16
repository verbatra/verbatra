import { describe, expect, it } from "vitest";
import { combineUsage, countableUsage, createUsageAccumulator, foldUsage } from "./usage.js";

describe("createUsageAccumulator / foldUsage", () => {
  it("starts undefined and stays undefined when nothing is folded in", () => {
    const acc = createUsageAccumulator();
    expect(acc.total).toBeUndefined();
  });

  it("stays undefined when only absent usage is folded in", () => {
    const acc = createUsageAccumulator();
    foldUsage(acc, undefined);
    foldUsage(acc, undefined);
    expect(acc.total).toBeUndefined();
  });

  it("becomes defined on the first real usage, never a fabricated zero before that", () => {
    const acc = createUsageAccumulator();
    foldUsage(acc, { inputTokens: 10, outputTokens: 5 });
    expect(acc.total).toEqual({ inputTokens: 10, outputTokens: 5 });
  });

  it("sums across multiple folds, absent ones contributing nothing in between", () => {
    const acc = createUsageAccumulator();
    foldUsage(acc, { inputTokens: 10, outputTokens: 5 });
    foldUsage(acc, undefined);
    foldUsage(acc, { inputTokens: 3, outputTokens: 7 });
    expect(acc.total).toEqual({ inputTokens: 13, outputTokens: 12 });
  });
});

describe("combineUsage", () => {
  it("returns undefined when both sides are undefined", () => {
    expect(combineUsage(undefined, undefined)).toBeUndefined();
  });

  it("returns the defined side unchanged when the other is undefined", () => {
    const usage = { inputTokens: 1, outputTokens: 2 };
    expect(combineUsage(usage, undefined)).toEqual(usage);
    expect(combineUsage(undefined, usage)).toEqual(usage);
  });

  it("sums both sides when both are defined", () => {
    expect(
      combineUsage({ inputTokens: 1, outputTokens: 2 }, { inputTokens: 3, outputTokens: 4 }),
    ).toEqual({
      inputTokens: 4,
      outputTokens: 6,
    });
  });
});

describe("countableUsage", () => {
  it("passes a clean report through untouched", () => {
    expect(countableUsage({ inputTokens: 60, outputTokens: 40 })).toEqual({
      inputTokens: 60,
      outputTokens: 40,
    });
  });

  it("floors a negative field at zero instead of letting it cancel a positive one", () => {
    expect(countableUsage({ inputTokens: 100, outputTokens: -60 })).toEqual({
      inputTokens: 100,
      outputTokens: 0,
    });
  });

  it("rounds a fractional field, so nothing downstream has to carry a non-integer token count", () => {
    expect(countableUsage({ inputTokens: 10.4, outputTokens: 0.6 })).toEqual({
      inputTokens: 10,
      outputTokens: 1,
    });
  });

  it("treats a field that is not a finite number as nothing reported", () => {
    expect(countableUsage({ inputTokens: Number.NaN, outputTokens: 5 })).toEqual({
      inputTokens: 0,
      outputTokens: 5,
    });
    expect(countableUsage({ inputTokens: 5, outputTokens: Number.POSITIVE_INFINITY })).toEqual({
      inputTokens: 5,
      outputTokens: 0,
    });
  });
});

describe("foldUsage: a report the run-status schema could not persist", () => {
  it("accumulates a whole-number total from a fractional report", () => {
    const accumulator = createUsageAccumulator();
    foldUsage(accumulator, { inputTokens: 10.5, outputTokens: 4.4 });
    expect(accumulator.total).toEqual({ inputTokens: 11, outputTokens: 4 });
  });

  it("never accumulates a negative total from a negative report", () => {
    const accumulator = createUsageAccumulator();
    foldUsage(accumulator, { inputTokens: -100, outputTokens: -100 });
    expect(accumulator.total).toEqual({ inputTokens: 0, outputTokens: 0 });
  });
});
