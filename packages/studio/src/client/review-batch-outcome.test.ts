import { describe, expect, it } from "vitest";
import {
  batchSummaryFailed,
  batchSummaryText,
  summarizeRetranslateBatch,
  summarizeReviewBatch,
} from "./review-batch-outcome.js";

const APPROVED = {
  ok: true as const,
  locale: "de",
  key: "a",
  provenance: { origin: "machine" as const, reviewState: "approved" as const },
};

describe("summarizeReviewBatch", () => {
  it("counts every recorded decision as done", () => {
    const summary = summarizeReviewBatch("approve", {
      ok: true,
      result: { results: [APPROVED, { ...APPROVED, key: "b" }] },
    });

    expect(summary).toEqual({ kind: "done", action: "approve", succeeded: 2, failures: [] });
    expect(batchSummaryFailed(summary)).toBe(false);
    expect(batchSummaryText(summary)).toBe(
      "Approved 2 entries. The decisions are saved in verbatra.provenance.json.",
    );
  });

  it("lists each refused entry with the friendly copy for its code", () => {
    const summary = summarizeReviewBatch("reject", {
      ok: true,
      result: {
        results: [
          { ...APPROVED, provenance: { origin: "machine", reviewState: "rejected" } },
          { ok: false, locale: "fr", key: "b", code: "REVIEW_VALUE_CHANGED", message: "raw" },
        ],
      },
    });

    expect(batchSummaryFailed(summary)).toBe(true);
    expect(batchSummaryText(summary)).toBe(
      "Rejected 1 entry. Their translations were removed and the decisions are saved in verbatra.provenance.json. " +
        "Could not reject 1 entry: b (fr): This translation changed since the queue was loaded, so nothing was saved. Look at the current value and decide again.",
    );
  });

  it("names only the failures when nothing succeeded", () => {
    const summary = summarizeReviewBatch("approve", {
      ok: true,
      result: {
        results: [
          { ok: false, locale: "de", key: "a", code: "SOMETHING_NEW", message: "raw text" },
          { ok: false, locale: "de", key: "b", code: "SOMETHING_NEW", message: "raw text" },
        ],
      },
    });

    expect(batchSummaryText(summary)).toBe(
      "Could not approve 2 entries: a (de): raw text; b (de): raw text",
    );
  });

  it("reports a refused call as a whole-batch error", () => {
    const summary = summarizeReviewBatch("approve", {
      ok: false,
      error: { code: "METHOD_RATE_LIMITED", message: "raw" },
    });

    expect(batchSummaryFailed(summary)).toBe(true);
    expect(batchSummaryText(summary)).toBe(
      "Could not approve the selected entries: Studio is limiting how often this action can run. Wait a moment and try again.",
    );
  });
});

describe("summarizeRetranslateBatch", () => {
  it("counts an accepted value as done and a gate refusal as a failure with its reason", () => {
    const summary = summarizeRetranslateBatch({
      ok: true,
      result: {
        results: [
          {
            ok: true,
            locale: "de",
            key: "a",
            result: { accepted: true, value: "x", reviewReasons: [] },
          },
          {
            ok: true,
            locale: "de",
            key: "b",
            result: { accepted: false, reason: "placeholder", details: ["{name}"], value: "y" },
          },
          {
            ok: true,
            locale: "de",
            key: "c",
            result: { accepted: false, reason: "empty", value: "" },
          },
          { ok: false, locale: "de", key: "d", code: "KEY_PROTECTED", message: "raw" },
        ],
      },
    });

    expect(summary).toMatchObject({ kind: "done", succeeded: 1 });
    expect(batchSummaryText(summary)).toBe(
      "Retranslated 1 entry. Review the new values, then approve or reject them. " +
        "Could not retranslate 3 entries: b (de): Rejected: placeholder mismatch ({name}); " +
        "c (de): Rejected: empty translation; " +
        "d (de): A person wrote, imported, or changed this value outside verbatra, so it is not retranslated without an explicit override.",
    );
  });

  it("reports a refused call as a whole-batch error", () => {
    const summary = summarizeRetranslateBatch({
      ok: false,
      error: { code: "METHOD_UNKNOWN", message: "raw" },
    });

    expect(summary).toMatchObject({ kind: "error", action: "retranslate" });
  });
});
