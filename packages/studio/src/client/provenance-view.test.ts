import type { KeyOrigin, ProvenanceSummary } from "@verbatra/sdk";
import { describe, expect, it } from "vitest";
import {
  ORIGIN_ORDER,
  provenanceBadgeView,
  provenanceDetailItems,
  provenanceSummaryText,
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
  it("lists origin, provider, model, review state and reviewer when present", () => {
    expect(
      provenanceDetailItems({
        origin: "machine",
        provider: "anthropic",
        model: "claude-x",
        reviewState: "approved",
        reviewer: "mk",
      }),
    ).toEqual([
      ["Origin", "Machine"],
      ["Provider", "anthropic"],
      ["Model", "claude-x"],
      ["Review", "Approved"],
      ["Reviewer", "mk"],
    ]);
  });

  it("leaves out fields the record does not carry", () => {
    expect(provenanceDetailItems({ origin: "human", reviewState: "unreviewed" })).toEqual([
      ["Origin", "Human"],
      ["Review", "Not reviewed"],
    ]);
  });

  it("names a rejected value", () => {
    expect(provenanceDetailItems({ origin: "import", reviewState: "rejected" })).toContainEqual([
      "Review",
      "Rejected",
    ]);
  });
});

describe("provenanceSummaryText", () => {
  it("says the counts are unavailable when the server left them out", () => {
    expect(provenanceSummaryText(undefined)).toBe("Unavailable");
  });

  it("says there are no values for an empty locale", () => {
    expect(provenanceSummaryText(summary({}))).toBe("No values");
  });

  it("lists the non-zero origins in display order", () => {
    expect(provenanceSummaryText(summary({ human: 2, machine: 12, external: 1 }))).toBe(
      "12 machine, 2 human, 1 edited outside verbatra",
    );
  });
});
