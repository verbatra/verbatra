import { describe, expect, it } from "vitest";
import {
  flattenReviewQueue,
  type ReviewQueueData,
  reviewedValueFor,
  toReviewQueueOutcome,
  unreviewedRows,
} from "./review-queue-data.js";

const MACHINE = { origin: "machine", reviewState: "unreviewed" } as const;

const AVAILABLE: ReviewQueueData = {
  available: true,
  locales: [
    {
      locale: "de",
      needsReview: [
        { key: "greeting", reasons: ["EQUALS_SOURCE"], provenance: MACHINE },
        {
          key: "farewell",
          reasons: ["LENGTH_RATIO_OUTLIER"],
          provenance: { origin: "fuzzy", reviewState: "unreviewed" },
        },
      ],
      approved: [
        { key: "title", reasons: [], provenance: { origin: "agent", reviewState: "approved" } },
      ],
    },
    {
      locale: "fr",
      needsReview: [{ key: "greeting", reasons: [], provenance: MACHINE }],
    },
  ],
};

describe("flattenReviewQueue", () => {
  it("returns an empty list when the queue is unavailable", () => {
    expect(flattenReviewQueue({ available: false, reason: "provenance-unreadable" })).toEqual([]);
  });

  it("flattens every locale's entries into one row each, with origin and review state", () => {
    expect(flattenReviewQueue(AVAILABLE)).toEqual([
      {
        locale: "de",
        key: "greeting",
        reasons: ["EQUALS_SOURCE"],
        origin: "machine",
        reviewState: "unreviewed",
      },
      {
        locale: "de",
        key: "farewell",
        reasons: ["LENGTH_RATIO_OUTLIER"],
        origin: "fuzzy",
        reviewState: "unreviewed",
      },
      { locale: "de", key: "title", reasons: [], origin: "agent", reviewState: "approved" },
      { locale: "fr", key: "greeting", reasons: [], origin: "machine", reviewState: "unreviewed" },
    ]);
  });

  it("counts only the entries that need review", () => {
    expect(unreviewedRows(AVAILABLE).map((row) => `${row.locale}:${row.key}`)).toEqual([
      "de:greeting",
      "de:farewell",
      "fr:greeting",
    ]);
  });
});

describe("toReviewQueueOutcome", () => {
  it("passes through a successful result unchanged", () => {
    expect(toReviewQueueOutcome({ ok: true, result: AVAILABLE })).toEqual({
      ok: true,
      result: AVAILABLE,
    });
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
