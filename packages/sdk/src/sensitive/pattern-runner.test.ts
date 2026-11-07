import { describe, expect, it, vi } from "vitest";
import { PATTERN_TIME_LIMIT_MS, runPattern } from "./pattern-runner.js";
import { MAX_PATTERN_SCAN_LENGTH } from "./scan-text.js";

const setup = vi.hoisted(() => ({ contexts: 0, scripts: 0 }));

vi.mock("node:vm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:vm")>();
  return {
    ...actual,
    createContext: (...args: Parameters<typeof actual.createContext>) => {
      setup.contexts += 1;
      return actual.createContext(...args);
    },
    Script: class extends actual.Script {
      constructor(...args: ConstructorParameters<typeof actual.Script>) {
        super(...args);
        setup.scripts += 1;
      }
    },
  };
});

const CATASTROPHIC = /(?:a?){30}x/gu;

describe("runPattern", () => {
  it("interrupts catastrophic regex backtracking at the time limit", () => {
    const started = performance.now();
    const run = runPattern(CATASTROPHIC, "a".repeat(30));
    const elapsed = performance.now() - started;

    expect(run).toEqual({ kind: "timed-out" });
    expect(elapsed).toBeGreaterThanOrEqual(PATTERN_TIME_LIMIT_MS - 5);
    expect(elapsed).toBeLessThan(PATTERN_TIME_LIMIT_MS * 2);
  });

  it("lets an ordinary pattern finish on CJK text at the scan cap", () => {
    const text = "漢字".repeat(MAX_PATTERN_SCAN_LENGTH / 2);

    expect(runPattern(/\p{L}+Falcon/gu, text)).toEqual({ kind: "matched", spans: [] });
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

  it("builds its context and script once, so a fast pattern pays no setup per call", () => {
    const text = "x".repeat(2_000);
    const contexts = setup.contexts;
    const scripts = setup.scripts;

    for (let run = 0; run < 200; run += 1) {
      runPattern(/Falcon/gu, text);
    }

    expect(contexts).toBe(1);
    expect(scripts).toBe(1);
    expect(setup.contexts).toBe(contexts);
    expect(setup.scripts).toBe(scripts);
  });
});
