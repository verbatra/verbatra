import { describe, expect, it } from "vitest";
import { PATTERN_TIME_LIMIT_MS, runPattern } from "./pattern-runner.js";

const CATASTROPHIC = /(?:a?){30}x/gu;

describe("runPattern", () => {
  it("interrupts catastrophic regex backtracking at the time limit", () => {
    const started = performance.now();
    const run = runPattern(CATASTROPHIC, "a".repeat(30));
    const elapsed = performance.now() - started;

    expect(run).toEqual({ kind: "timed-out" });
    expect(elapsed).toBeGreaterThanOrEqual(PATTERN_TIME_LIMIT_MS - 5);
    expect(elapsed).toBeLessThan(PATTERN_TIME_LIMIT_MS + 1_000);
  });

  it("stays usable after an interrupted run", () => {
    runPattern(CATASTROPHIC, "a".repeat(30), 10);

    expect(runPattern(/Falcon/gu, "Project Falcon and Falcon")).toEqual({
      kind: "matched",
      spans: [
        { start: 8, end: 14 },
        { start: 19, end: 25 },
      ],
    });
  });

  it("drops empty matches", () => {
    expect(runPattern(/x*/gu, "abx")).toEqual({ kind: "matched", spans: [{ start: 2, end: 3 }] });
  });

  it("rethrows an error that is not a timeout", () => {
    expect(() => runPattern(/Falcon/u, "Falcon")).toThrow(/non-global/);
  });

  it("adds well under a millisecond to a fast pattern", () => {
    const text = "x".repeat(2_000);
    runPattern(/Falcon/gu, text);
    const runs = 200;
    const started = performance.now();
    for (let run = 0; run < runs; run += 1) {
      runPattern(/Falcon/gu, text);
    }

    expect((performance.now() - started) / runs).toBeLessThan(1);
  });
});
