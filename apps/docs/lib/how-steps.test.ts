import { describe, expect, it } from "vitest";
import { GATE_RUN_LINES } from "@/lib/gate-demo";
import { HOW_TOTAL_LINES, howStepStates } from "@/lib/how-steps";

describe("howStepStates", () => {
  it("marks no step before the replay starts", () => {
    expect(howStepStates({ lines: 0, typing: false })).toEqual([
      "upcoming",
      "upcoming",
      "upcoming",
      "upcoming",
    ]);
  });

  it("advances configure, diff, translate, verify as the terminal prints the run", () => {
    const current = (lines: number, typing = false) =>
      howStepStates({ lines, typing }).indexOf("current");
    expect(current(0, true)).toBe(0);
    expect(current(1)).toBe(1);
    expect(current(2)).toBe(1);
    expect(current(3)).toBe(2);
    expect(current(4)).toBe(3);
    expect(current(HOW_TOTAL_LINES - 1)).toBe(3);
    expect(howStepStates({ lines: 3, typing: false })).toEqual([
      "complete",
      "complete",
      "current",
      "upcoming",
    ]);
  });

  it("shows every step complete once the whole run is on screen", () => {
    expect(HOW_TOTAL_LINES).toBe(1 + GATE_RUN_LINES.length);
    expect(howStepStates({ lines: HOW_TOTAL_LINES, typing: false })).toEqual([
      "complete",
      "complete",
      "complete",
      "complete",
    ]);
  });
});
