import { cpuScalingRatio, LINEAR_MAX_RATIO, LINEAR_SCALE } from "@verbatra/config/scaling";
import { describe, expect, it } from "vitest";
import { protectedRuns } from "./protected-runs.js";

const DEPTH = 20_000;
const LENGTH = 200_000;

function nested(head: string, tail: string, depth: number): string {
  return `${head.repeat(depth)}x${tail.repeat(depth)}`;
}

function repeatedTo(unit: string, length: number): string {
  return unit.repeat(Math.ceil(length / unit.length)).slice(0, length);
}

describe("protectedRuns on deeply nested ICU arguments", () => {
  it("marks twenty thousand nested plural arms without exhausting the stack", () => {
    const value = nested("{n, plural, one {a", "}}", DEPTH);

    const runs = protectedRuns(value);

    expect(runs.map((run) => run.text).join("")).toBe(value);
    expect(runs.filter((run) => !run.protected).map((run) => run.text)).toEqual([
      ...Array.from({ length: DEPTH - 1 }, () => "a"),
      "ax",
    ]);
  });

  it.each([
    ["{n,plural,o{", "}"],
    ["{n,plural,o{<b", "}"],
    ["{", "}"],
  ])("stays linear on %j nested to 200k characters", (head, tail) => {
    const depthOf = (length: number) => Math.floor(length / (head.length + tail.length));
    const small = nested(head, tail, depthOf(LENGTH / LINEAR_SCALE));
    const large = nested(head, tail, depthOf(LENGTH));

    expect(cpuScalingRatio(protectedRuns, small, large)).toBeLessThan(LINEAR_MAX_RATIO);
  });

  it.each(["{a,", "{{a,", "<a href=", "&#", "%1$"])(
    "stays linear on %j repeated to 200k characters",
    (unit) => {
      const small = repeatedTo(unit, LENGTH / LINEAR_SCALE);
      const large = repeatedTo(unit, LENGTH);

      expect(cpuScalingRatio(protectedRuns, small, large)).toBeLessThan(LINEAR_MAX_RATIO);
    },
  );
});
