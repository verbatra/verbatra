import { describe, expect, it } from "vitest";
import { deriveReviewDecisionOutcome, isStaleValueOutcome } from "./review-decision-outcome.js";

describe("deriveReviewDecisionOutcome", () => {
  it("reports a saved decision as success", () => {
    expect(
      deriveReviewDecisionOutcome({
        ok: true,
        result: {
          locale: "de",
          key: "greeting",
          provenance: { origin: "machine", reviewState: "approved" },
        },
      }),
    ).toEqual({ kind: "success" });
  });

  it("explains a known refusal in the dashboard's own words", () => {
    const outcome = deriveReviewDecisionOutcome({
      ok: false,
      error: { code: "REVIEW_SOURCE_CHANGED", message: "raw sdk text" },
    });

    expect(outcome.kind).toBe("error");
    expect(outcome.kind === "error" && outcome.message).toContain("source text changed");
  });

  it("falls back to the server message for an unknown code", () => {
    expect(
      deriveReviewDecisionOutcome({ ok: false, error: { code: "SOMETHING_NEW", message: "boom" } }),
    ).toEqual({ kind: "error", code: "SOMETHING_NEW", message: "boom" });
  });
});

describe("isStaleValueOutcome", () => {
  it("is true only for a refusal because the value changed", () => {
    expect(isStaleValueOutcome({ kind: "error", code: "REVIEW_VALUE_CHANGED", message: "x" })).toBe(
      true,
    );
    expect(isStaleValueOutcome({ kind: "error", code: "LOCK_CONTENDED", message: "x" })).toBe(
      false,
    );
    expect(isStaleValueOutcome({ kind: "success" })).toBe(false);
  });
});
