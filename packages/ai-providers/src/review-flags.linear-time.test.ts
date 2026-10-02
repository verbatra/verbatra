import { cpuScalingRatio, LINEAR_MAX_RATIO, LINEAR_SCALE } from "@verbatra/config/scaling";
import { describe, expect, it } from "vitest";
import type { LocaleGlossary } from "./glossary.js";
import { computeReviewFlags, type ReviewFlagInput } from "./review-flags.js";

const LENGTH = 200_000;

function untranslated(value: string, fixedTerms: readonly string[]): ReviewFlagInput {
  const glossary: LocaleGlossary = {
    terms: [],
    doNotTranslate: fixedTerms.map((term) => ({ term, caseSensitive: true })),
  };
  return {
    sourceValue: value,
    translatedValue: value,
    sourceLocale: "en",
    targetLocale: "de",
    integrity: { matches: true, missing: [], extra: [], reordered: false },
    glossary,
  };
}

describe("computeReviewFlags: fixed terms in an untranslated value", () => {
  it("still treats a value made of overlapping fixed terms as fixed", () => {
    expect(computeReviewFlags(untranslated("名名名名", ["名名名"]))).toBeUndefined();
    expect(computeReviewFlags(untranslated("-a-a-", ["-a-"]))).toBeUndefined();
  });

  it("still flags letters left over beside overlapping fixed terms", () => {
    expect(computeReviewFlags(untranslated("-a-a-xy", ["-a-"]))?.reasons).toEqual([
      "EQUALS_SOURCE",
    ]);
  });

  it.each([
    ["名", "名"],
    ["-a", "a"],
    ["a://", "a"],
    ["<span", "<span"],
    ["-a-", "-a-"],
  ])("stays linear when %j repeats to 200k characters around the fixed term %j", (unit, term) => {
    const repeatedTo = (length: number) =>
      unit.repeat(Math.ceil(length / unit.length)).slice(0, length);
    const flag = (value: string) => computeReviewFlags(untranslated(value, [term]));

    expect(
      cpuScalingRatio(flag, repeatedTo(LENGTH / LINEAR_SCALE), repeatedTo(LENGTH)),
    ).toBeLessThan(LINEAR_MAX_RATIO);
  });
});
