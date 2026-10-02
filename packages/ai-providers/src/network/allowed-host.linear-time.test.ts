import { cpuScalingRatio, LINEAR_MAX_RATIO, LINEAR_SCALE } from "@verbatra/config/scaling";
import { describe, expect, it } from "vitest";
import { ALLOWED_HOST_PATTERN } from "./allowed-host.js";

const LENGTH = 200_000;

function repeatedTo(unit: string, length: number): string {
  return unit.repeat(Math.ceil(length / unit.length)).slice(0, length);
}

describe("ALLOWED_HOST_PATTERN on a long rejected value", () => {
  it.each([
    [":", "!"],
    ["a:", "!"],
    ["a:", "}"],
    [":.", "/"],
    ["a.", "!"],
    ["a-", "!"],
    ["1.", "/"],
  ])("stays linear on %j repeated to 200k characters followed by %j", (unit, suffix) => {
    const small = repeatedTo(unit, LENGTH / LINEAR_SCALE) + suffix;
    const large = repeatedTo(unit, LENGTH) + suffix;
    const accepts = (value: string) => ALLOWED_HOST_PATTERN.test(value);

    expect(cpuScalingRatio(accepts, small, large)).toBeLessThan(LINEAR_MAX_RATIO);
  });
});
