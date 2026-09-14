import type { ReviewReasonCode } from "@verbatra/sdk";
import { describe, expect, it } from "vitest";
import { reviewReasonLabel } from "./review-reason-labels.js";

const ALL_CODES: readonly ReviewReasonCode[] = [
  "LENGTH_RATIO_OUTLIER",
  "MAX_LENGTH_EXCEEDED",
  "EQUALS_SOURCE",
  "GLOSSARY_TERM_MISSED",
  "INTEGRITY_REORDERED",
  "PROVIDER_DEGRADED",
];

describe("reviewReasonLabel", () => {
  it("renders all six ReviewReasonCode values with a distinct, non-empty label", () => {
    const labels = ALL_CODES.map((code) => reviewReasonLabel(code).label);
    expect(new Set(labels).size).toBe(ALL_CODES.length);
    for (const label of labels) {
      expect(label.length).toBeGreaterThan(0);
    }
  });

  it("never renders the raw code string as the label", () => {
    for (const code of ALL_CODES) {
      expect(reviewReasonLabel(code).label).not.toBe(code);
    }
  });

  it("gives every code a valid Badge tone", () => {
    const validTones = new Set(["success", "warning", "neutral", "danger"]);
    for (const code of ALL_CODES) {
      expect(validTones.has(reviewReasonLabel(code).tone)).toBe(true);
    }
  });

  it("gives PROVIDER_DEGRADED a distinct tone from the five content-derived reasons", () => {
    expect(reviewReasonLabel("PROVIDER_DEGRADED").tone).toBe("neutral");
    for (const code of ALL_CODES.filter((c) => c !== "PROVIDER_DEGRADED")) {
      expect(reviewReasonLabel(code).tone).toBe("warning");
    }
  });
});
