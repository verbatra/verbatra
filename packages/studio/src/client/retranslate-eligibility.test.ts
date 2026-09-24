import { describe, expect, it } from "vitest";
import type { IntegrityPillView } from "./integrity-pill.js";
import {
  canRetranslate,
  canRetranslateReviewed,
  type RetranslateCapabilities,
} from "./retranslate-eligibility.js";

const BOTH_ON: RetranslateCapabilities = { spend: true, writeToDisk: true };
const DANGER_PILL: IntegrityPillView = {
  tone: "danger",
  label: "Placeholder mismatch",
  detail: null,
};
const SUCCESS_PILL: IntegrityPillView = {
  tone: "success",
  label: "Placeholders match",
  detail: null,
};

describe("canRetranslate", () => {
  it("is true only when both capabilities are granted and the pill reports danger", () => {
    expect(canRetranslate(BOTH_ON, DANGER_PILL)).toBe(true);
  });

  it("is false when capabilities have not loaded yet", () => {
    expect(canRetranslate(undefined, DANGER_PILL)).toBe(false);
  });

  it("is false when spend is off", () => {
    expect(canRetranslate({ spend: false, writeToDisk: true }, DANGER_PILL)).toBe(false);
  });

  it("is false when writeToDisk is off", () => {
    expect(canRetranslate({ spend: true, writeToDisk: false }, DANGER_PILL)).toBe(false);
  });

  it("is false when both capabilities are off", () => {
    expect(canRetranslate({ spend: false, writeToDisk: false }, DANGER_PILL)).toBe(false);
  });

  it("is false when the pill is null (key not changed in this locale)", () => {
    expect(canRetranslate(BOTH_ON, null)).toBe(false);
  });

  it("is false when the pill reports success (nothing to retranslate)", () => {
    expect(canRetranslate(BOTH_ON, SUCCESS_PILL)).toBe(false);
  });

  it("is false when the pill reports neutral (no placeholders, trivially matching)", () => {
    const neutral: IntegrityPillView = { tone: "neutral", label: "No placeholders", detail: null };
    expect(canRetranslate(BOTH_ON, neutral)).toBe(false);
  });
});

describe("canRetranslateReviewed", () => {
  it.each([
    [undefined, false],
    [{ spend: false, writeToDisk: true }, false],
    [{ spend: true, writeToDisk: false }, false],
    [{ spend: true, writeToDisk: true }, true],
  ] as const)("answers %j with %s", (capabilities, expected) => {
    expect(canRetranslateReviewed(capabilities)).toBe(expected);
  });
});
