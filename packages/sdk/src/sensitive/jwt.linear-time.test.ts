import { cpuScalingRatio, LINEAR_MAX_RATIO, LINEAR_SCALE } from "@verbatra/config/scaling";
import { describe, expect, it } from "vitest";
import { jwtSpans } from "./jwt.js";

const LENGTH = 200_000;

function repeatedTo(unit: string, length: number): string {
  return unit.repeat(Math.ceil(length / unit.length)).slice(0, length);
}

describe("jwtSpans on a long value", () => {
  it.each([
    "eyJ-",
    "eyJ_",
    "eyJaaaaaaaa-",
    "eyJaaaaaaaa.",
    "eyJaaaaaaaa.eyJ-",
    "eyJaaaaaaaa.eyJaaaaaaaa.",
  ])("stays linear on %j repeated to 200k characters", (unit) => {
    const small = repeatedTo(unit, LENGTH / LINEAR_SCALE);
    const large = repeatedTo(unit, LENGTH);

    expect(cpuScalingRatio(jwtSpans, small, large)).toBeLessThan(LINEAR_MAX_RATIO);
  });
});
