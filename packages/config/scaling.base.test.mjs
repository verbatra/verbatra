import { describe, expect, it } from "vitest";
import { cpuScalingRatio, LINEAR_MAX_RATIO, LINEAR_SCALE } from "./scaling.base.mjs";

const linear = (n) => {
  let total = 0;
  for (let i = 0; i < n; i += 1) {
    total += i;
  }
  return total;
};

const quadratic = (n) => {
  let total = 0;
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) {
      total += j;
    }
  }
  return total;
};

describe("cpuScalingRatio", () => {
  it("keeps a linear workload under the linear bound", () => {
    expect(cpuScalingRatio(linear, 200_000, 200_000 * LINEAR_SCALE)).toBeLessThan(LINEAR_MAX_RATIO);
  });

  it("flags a quadratic workload above the linear bound", () => {
    expect(cpuScalingRatio(quadratic, 40, 40 * LINEAR_SCALE, 3)).toBeGreaterThan(LINEAR_MAX_RATIO);
  });
});
