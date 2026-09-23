import { describe, expect, it } from "vitest";
import { createReviewOverlayStore } from "./review-overlay.js";
import {
  flattenReviewQueue,
  type ReviewQueueData,
  reviewedValueFor,
  toReviewQueueOutcome,
  visibleReviewQueueRows,
} from "./review-queue-data.js";

const AVAILABLE: ReviewQueueData = {
  available: true,
  version: 1,
  generatedAt: "2026-07-16T00:00:00.000Z",
  locales: [
    {
      locale: "de",
      status: "succeeded",
      needsReview: [
        { key: "greeting", reasons: ["EQUALS_SOURCE"] },
        { key: "farewell", reasons: ["LENGTH_RATIO_OUTLIER", "PROVIDER_DEGRADED"] },
      ],
    },
    {
      locale: "fr",
      status: "succeeded",
      needsReview: [{ key: "greeting", reasons: ["GLOSSARY_TERM_MISSED"] }],
    },
  ],
};

describe("flattenReviewQueue", () => {
  it("returns an empty list for available: false", () => {
    expect(flattenReviewQueue({ available: false })).toEqual([]);
  });

  it("flattens every locale's needsReview entries into one row per (locale, key) pair", () => {
    const rows = flattenReviewQueue(AVAILABLE);
    expect(rows).toEqual([
      { locale: "de", key: "greeting", reasons: ["EQUALS_SOURCE"] },
      { locale: "de", key: "farewell", reasons: ["LENGTH_RATIO_OUTLIER", "PROVIDER_DEGRADED"] },
      { locale: "fr", key: "greeting", reasons: ["GLOSSARY_TERM_MISSED"] },
    ]);
  });

  it("passes exact key names and reason arrays through unmodified, never inventing new data", () => {
    const rows = flattenReviewQueue(AVAILABLE);
    const deFarewell = rows.find((row) => row.locale === "de" && row.key === "farewell");
    expect(deFarewell?.reasons).toEqual(["LENGTH_RATIO_OUTLIER", "PROVIDER_DEGRADED"]);
  });

  it("returns an empty list when available but no locale has any flagged key", () => {
    const empty: ReviewQueueData = {
      available: true,
      version: 1,
      generatedAt: "2026-07-16T00:00:00.000Z",
      locales: [{ locale: "de", status: "succeeded", needsReview: [] }],
    };
    expect(flattenReviewQueue(empty)).toEqual([]);
  });
});

describe("visibleReviewQueueRows", () => {
  it("excludes an actioned row from a fresh read, matching acceptance criterion 13/14's overlay behavior", () => {
    const overlay = createReviewOverlayStore();
    overlay.markActioned({ locale: "de", key: "greeting" });

    const rows = visibleReviewQueueRows(AVAILABLE, overlay);
    expect(rows.map((row) => `${row.locale}:${row.key}`)).toEqual(["de:farewell", "fr:greeting"]);
  });

  it("still excludes the actioned row across a second call with the same overlay, simulating the SSE refresh re-fetch", () => {
    const overlay = createReviewOverlayStore();
    overlay.markActioned({ locale: "de", key: "greeting" });

    const first = visibleReviewQueueRows(AVAILABLE, overlay);
    const second = visibleReviewQueueRows(AVAILABLE, overlay);

    expect(first.some((row) => row.locale === "de" && row.key === "greeting")).toBe(false);
    expect(second.some((row) => row.locale === "de" && row.key === "greeting")).toBe(false);
  });

  it("a fresh overlay (simulating a full page reload) no longer excludes the previously actioned row", () => {
    const before = createReviewOverlayStore();
    before.markActioned({ locale: "de", key: "greeting" });

    const afterReload = createReviewOverlayStore();
    const rows = visibleReviewQueueRows(AVAILABLE, afterReload);

    expect(rows.some((row) => row.locale === "de" && row.key === "greeting")).toBe(true);
  });
});

describe("toReviewQueueOutcome", () => {
  it("passes through a successful result unchanged", () => {
    const outcome = toReviewQueueOutcome({ ok: true, result: AVAILABLE });
    expect(outcome).toEqual({ ok: true, result: AVAILABLE });
  });

  it("passes through a transport or domain error unchanged", () => {
    const outcome = toReviewQueueOutcome({
      ok: false,
      error: { code: "SESSION_EXPIRED", message: "expired" },
    });
    expect(outcome).toEqual({ ok: false, error: { code: "SESSION_EXPIRED", message: "expired" } });
  });
});

describe("reviewedValueFor", () => {
  const values = new Map([
    ["de\tgreeting", { source: "Hello", target: "Hallo" }],
    ["de\tfarewell", { source: "Bye" }],
  ]);

  it("returns the translation the row's locale holds for its key", () => {
    expect(reviewedValueFor(values, { locale: "de", key: "greeting" })).toBe("Hallo");
  });

  it("returns nothing for a key without a translation or a row with no loaded value", () => {
    expect(reviewedValueFor(values, { locale: "de", key: "farewell" })).toBeUndefined();
    expect(reviewedValueFor(values, { locale: "fr", key: "greeting" })).toBeUndefined();
  });
});
