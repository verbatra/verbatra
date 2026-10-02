import { cpuScalingRatio, LINEAR_MAX_RATIO, LINEAR_SCALE } from "@verbatra/config/scaling";
import { describe, expect, it } from "vitest";
import { emailSpans } from "./email.js";

const LENGTH = 200_000;

function repeatedTo(unit: string, length: number): string {
  return unit.repeat(Math.ceil(length / unit.length)).slice(0, length);
}

describe("emailSpans on a long domain", () => {
  it.each([
    ["a@", ".", "x"],
    ["a@", "-", "x"],
    ["a@", ".-", "x"],
    ["a@b", ".", ""],
    ["a@", "a.", "-"],
  ])("stays linear on %j followed by %j and %j", (prefix, filler, suffix) => {
    const small = prefix + repeatedTo(filler, LENGTH / LINEAR_SCALE) + suffix;
    const large = prefix + repeatedTo(filler, LENGTH) + suffix;

    expect(cpuScalingRatio(emailSpans, small, large)).toBeLessThan(LINEAR_MAX_RATIO);
  });

  it("drops trailing dots and hyphens from the domain", () => {
    const text = "write to someone@mail.example.de.-. today";

    expect(emailSpans(text).map((span) => text.slice(span.start, span.end))).toEqual([
      "someone@mail.example.de",
    ]);
  });
});
