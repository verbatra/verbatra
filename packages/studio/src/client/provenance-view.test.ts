import type { KeyOrigin, ProvenanceSummary } from "@verbatra/sdk";
import { describe, expect, it } from "vitest";
import {
  ORIGIN_ORDER,
  provenanceBadgeView,
  provenanceDetailItems,
  provenanceSummaryParts,
} from "./provenance-view.js";

function summary(byOrigin: Partial<Record<KeyOrigin, number>>): ProvenanceSummary {
  const full = Object.fromEntries(ORIGIN_ORDER.map((origin) => [origin, byOrigin[origin] ?? 0]));
  return {
    byOrigin: full as Record<KeyOrigin, number>,
    byReviewState: { unreviewed: 0, approved: 0, rejected: 0 },
  };
}

describe("provenanceBadgeView", () => {
  it("returns nothing when the provenance is unknown to the server", () => {
    expect(provenanceBadgeView(undefined)).toBeNull();
  });

  it.each([
    ["machine", "Machine", "neutral"],
    ["memory", "Memory", "neutral"],
    ["fuzzy", "Fuzzy match", "warning"],
    ["agent", "Agent", "neutral"],
    ["human", "Human", "success"],
    ["import", "Import", "success"],
    ["unknown", "Unknown", "neutral"],
    ["unrecorded", "Unrecorded", "neutral"],
    ["external", "Edited outside verbatra", "warning"],
  ] as const)("labels %s as %s with the %s tone", (origin, label, tone) => {
    const view = provenanceBadgeView({ origin, reviewState: "unreviewed" });
    expect(view?.label).toBe(label);
    expect(view?.tone).toBe(tone);
    expect(view?.description.length).toBeGreaterThan(0);
  });

  it("covers every origin in the display order exactly once", () => {
    expect(new Set(ORIGIN_ORDER).size).toBe(9);
  });
});

describe("provenanceDetailItems", () => {
  it("lists provider, model, review state and reviewer when present, leaving the origin to the badge", () => {
    expect(
      provenanceDetailItems({
        origin: "machine",
        provider: "anthropic",
        model: "claude-x",
        reviewState: "approved",
        reviewer: "mk",
      }),
    ).toEqual([
      { label: "Provider", value: "anthropic", identifier: true },
      { label: "Model", value: "claude-x", identifier: true },
      { label: "Review", value: "Approved", identifier: false },
      { label: "Reviewer", value: "mk", identifier: false },
    ]);
  });

  it("leaves out fields the record does not carry", () => {
    expect(provenanceDetailItems({ origin: "human", reviewState: "unreviewed" })).toEqual([
      { label: "Review", value: "Not reviewed", identifier: false },
    ]);
  });

  it("names a rejected value", () => {
    expect(provenanceDetailItems({ origin: "import", reviewState: "rejected" })).toContainEqual({
      label: "Review",
      value: "Rejected",
      identifier: false,
    });
  });
});

describe("provenanceSummaryParts", () => {
  it("says the counts are unavailable when the server left them out", () => {
    expect(provenanceSummaryParts(undefined)).toEqual(["Unavailable"]);
  });

  it("says there are no values for an empty locale", () => {
    expect(provenanceSummaryParts(summary({}))).toEqual(["No values"]);
  });

  it("lists the non-zero origins in display order, one part each", () => {
    expect(provenanceSummaryParts(summary({ human: 2, machine: 12, external: 1 }))).toEqual([
      "12 machine",
      "2 human",
      "1 edited outside verbatra",
    ]);
  });
});
