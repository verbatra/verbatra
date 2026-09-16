import type { TranslationEntry } from "@verbatra/core";
import { describe, expect, it } from "vitest";
import {
  type BudgetReservation,
  type BudgetTracker,
  budgetAlreadyStoppedNotice,
  budgetExceededNotice,
  budgetWithheldNotice,
  checkBudgetTrip,
  createBudgetTracker,
  reconcileBudget,
  reserveBudget,
  toBudgetSummary,
} from "./budget.js";
import type { PayloadContext } from "./estimate.js";

const context: PayloadContext = { sourceLocale: "en", targetLocale: "de" };

function entries(count: number): readonly TranslationEntry[] {
  return Array.from({ length: count }, (_, index) => ({
    key: `k${index}`,
    namespace: "",
    value: `v${index}`,
    placeholders: [],
    isPlural: false,
  }));
}

function reserveOrThrow(tracker: BudgetTracker, count = 2): BudgetReservation {
  const { reservation } = reserveBudget(tracker, entries(count), context);
  if (reservation === undefined) {
    throw new Error("expected the reservation to be accepted");
  }
  return reservation;
}

function spend(tracker: BudgetTracker, inputTokens: number, outputTokens: number): void {
  reconcileBudget(tracker, reserveOrThrow(tracker), { inputTokens, outputTokens });
}

describe("createBudgetTracker / toBudgetSummary", () => {
  it("returns undefined when no maxTokens is configured", () => {
    const tracker = createBudgetTracker(undefined, "warn");
    expect(toBudgetSummary(tracker)).toBeUndefined();
  });

  it("starts with nothing counted and nothing reported", () => {
    const tracker = createBudgetTracker(100, "warn");
    expect(toBudgetSummary(tracker)).toEqual({
      maxTokens: 100,
      behavior: "warn",
      supported: false,
      tokensUsed: 0,
      exceeded: false,
    });
  });
});

describe("reserveBudget", () => {
  it("projects nothing and charges nothing when no maxTokens is configured", () => {
    const tracker = createBudgetTracker(undefined, "stop");
    const { reservation } = reserveBudget(tracker, entries(50), context);
    expect(reservation).toEqual({ projected: 0 });
    expect(tracker.tokensUsed).toBe(0);
  });

  it("charges the projection up front so a later reservation sees it", () => {
    const tracker = createBudgetTracker(100_000, "stop");
    const first = reserveOrThrow(tracker);
    expect(first.projected).toBeGreaterThan(0);
    expect(tracker.tokensUsed).toBe(first.projected);

    const second = reserveOrThrow(tracker);
    expect(tracker.tokensUsed).toBe(first.projected + second.projected);
  });

  it("refuses a batch whose projection would cross the ceiling, charging nothing for it", () => {
    const tracker = createBudgetTracker(1, "stop");
    const decision = reserveBudget(tracker, entries(2), context);
    expect(decision.reservation).toBeUndefined();
    expect(decision.refusedProjection).toBeGreaterThan(1);
    expect(tracker.tokensUsed).toBe(0);
    expect(tracker.exceeded).toBe(true);
    expect(tracker.stopped).toBe(true);
  });

  it("accepts a batch whose projection lands exactly on the ceiling", () => {
    const probe = createBudgetTracker(100_000, "stop");
    const projected = reserveOrThrow(probe).projected;

    const tracker = createBudgetTracker(projected, "stop");
    expect(reserveBudget(tracker, entries(2), context).reservation).toEqual({ projected });
  });

  it("never refuses under warn, so the default behavior still withholds nothing", () => {
    const tracker = createBudgetTracker(1, "warn");
    const { reservation } = reserveBudget(tracker, entries(2), context);
    expect(reservation).not.toBeUndefined();
    expect(tracker.stopped).toBe(false);
  });
});

describe("reconcileBudget", () => {
  it("replaces an under-estimate with the reported usage", () => {
    const tracker = createBudgetTracker(100_000, "stop");
    const reservation = reserveOrThrow(tracker);
    expect(reservation.projected).toBeLessThan(9_000);

    reconcileBudget(tracker, reservation, { inputTokens: 6_000, outputTokens: 3_000 });
    expect(tracker.tokensUsed).toBe(9_000);
    expect(tracker.usageSeen).toBe(true);
  });

  it("replaces an over-estimate with the reported usage, freeing the difference", () => {
    const tracker = createBudgetTracker(100_000, "stop");
    const reservation = reserveOrThrow(tracker);
    expect(reservation.projected).toBeGreaterThan(10);

    reconcileBudget(tracker, reservation, { inputTokens: 6, outputTokens: 4 });
    expect(tracker.tokensUsed).toBe(10);
  });

  it("treats an explicit zero report as no usable report, keeping the projection", () => {
    const tracker = createBudgetTracker(100_000, "stop");
    const reservation = reserveOrThrow(tracker);

    reconcileBudget(tracker, reservation, { inputTokens: 0, outputTokens: 0 });
    expect(tracker.tokensUsed).toBe(reservation.projected);
    expect(tracker.usageSeen).toBe(false);
  });

  it("floors a negative field at zero rather than letting it cancel a positive one", () => {
    const tracker = createBudgetTracker(100_000, "stop");
    const reservation = reserveOrThrow(tracker);

    reconcileBudget(tracker, reservation, { inputTokens: 100, outputTokens: -60 });
    expect(tracker.tokensUsed).toBe(100);
  });

  it("keeps the counted total a whole number when the provider reports fractions", () => {
    const tracker = createBudgetTracker(100_000, "stop");
    const reservation = reserveOrThrow(tracker);

    reconcileBudget(tracker, reservation, { inputTokens: 10.5, outputTokens: 4.4 });
    expect(tracker.tokensUsed).toBe(15);
    expect(Number.isInteger(tracker.tokensUsed)).toBe(true);
  });

  it("refuses to let a negative report drive the counted total down", () => {
    const tracker = createBudgetTracker(100_000, "stop");
    const reservation = reserveOrThrow(tracker);

    reconcileBudget(tracker, reservation, { inputTokens: -5_000, outputTokens: -5_000 });
    expect(tracker.tokensUsed).toBe(reservation.projected);
  });

  it("keeps the projection when the provider reports no usage, instead of counting nothing", () => {
    const tracker = createBudgetTracker(100_000, "stop");
    const reservation = reserveOrThrow(tracker);

    reconcileBudget(tracker, reservation, undefined);
    expect(tracker.tokensUsed).toBe(reservation.projected);
    expect(tracker.usageSeen).toBe(false);
  });
});

describe("checkBudgetTrip", () => {
  it("returns false when no maxTokens is configured, regardless of tokensUsed", () => {
    const tracker = createBudgetTracker(undefined, "stop");
    spend(tracker, 1000, 1000);
    expect(checkBudgetTrip(tracker)).toBe(false);
    expect(tracker.stopped).toBe(false);
  });

  it("returns false while tokensUsed stays under maxTokens", () => {
    const tracker = createBudgetTracker(100_000, "warn");
    spend(tracker, 50, 40);
    expect(checkBudgetTrip(tracker)).toBe(false);
    expect(tracker.exceeded).toBe(false);
  });

  it("trips exactly once: true on the crossing call, false on every later call", () => {
    const tracker = createBudgetTracker(100, "warn");
    spend(tracker, 60, 50);
    expect(checkBudgetTrip(tracker)).toBe(true);
    expect(tracker.exceeded).toBe(true);

    spend(tracker, 10, 0);
    expect(checkBudgetTrip(tracker)).toBe(false);
  });

  it("sets stopped only in stop mode", () => {
    const warnTracker = createBudgetTracker(10, "warn");
    spend(warnTracker, 10, 0);
    checkBudgetTrip(warnTracker);
    expect(warnTracker.stopped).toBe(false);

    const stopTracker = createBudgetTracker(400, "stop");
    spend(stopTracker, 500, 0);
    checkBudgetTrip(stopTracker);
    expect(stopTracker.stopped).toBe(true);
  });

  it("treats a total exactly equal to maxTokens as a trip (at or past the ceiling)", () => {
    const tracker = createBudgetTracker(50, "warn");
    spend(tracker, 25, 25);
    expect(checkBudgetTrip(tracker)).toBe(true);
  });
});

describe("toBudgetSummary after activity", () => {
  it("reflects the tracker's live state", () => {
    const tracker = createBudgetTracker(50, "warn");
    spend(tracker, 30, 30);
    checkBudgetTrip(tracker);
    expect(toBudgetSummary(tracker)).toEqual({
      maxTokens: 50,
      behavior: "warn",
      supported: true,
      tokensUsed: 60,
      exceeded: true,
    });
  });

  it("reports a count and no provider-reported usage when every call was estimated", () => {
    const tracker = createBudgetTracker(100_000, "stop");
    reconcileBudget(tracker, reserveOrThrow(tracker), undefined);
    const summary = toBudgetSummary(tracker);
    expect(summary?.supported).toBe(false);
    expect(summary?.tokensUsed).toBeGreaterThan(0);
  });

  it("calls the figure the provider's own only when every counted call reported usage", () => {
    const reported = createBudgetTracker(100_000, "stop");
    spend(reported, 10, 10);
    spend(reported, 10, 10);
    expect(toBudgetSummary(reported)?.supported).toBe(true);

    const mixed = createBudgetTracker(100_000, "stop");
    spend(mixed, 10, 10);
    reconcileBudget(mixed, reserveOrThrow(mixed), undefined);
    expect(toBudgetSummary(mixed)?.supported).toBe(false);
  });
});

describe("budgetExceededNotice", () => {
  it("carries the stable code and no prompt content, key, or translatable value", () => {
    const tracker = createBudgetTracker(100, "warn");
    spend(tracker, 60, 50);
    checkBudgetTrip(tracker);

    const notice = budgetExceededNotice(tracker);
    expect(notice.code).toBe("BUDGET_TOKENS_EXCEEDED");
    expect(notice.message).toContain("100");
    expect(notice.message).toContain("110");
    expect(notice.message).toContain("warn");
  });

  it("names the run's state, not an earlier locale's projection, once it has already stopped", () => {
    const tracker = createBudgetTracker(1, "stop");

    const notice = budgetAlreadyStoppedNotice(tracker);
    expect(notice.code).toBe("BUDGET_TOKENS_EXCEEDED");
    expect(notice.message).toContain("had already reached");
    expect(notice.message).not.toContain("projected at");
  });

  it("reports the refused projection rather than a ceiling the count never reached", () => {
    const tracker = createBudgetTracker(1, "stop");
    const { refusedProjection } = reserveBudget(tracker, entries(2), context);

    const notice = budgetWithheldNotice(tracker, refusedProjection ?? 0);
    expect(notice.code).toBe("BUDGET_TOKENS_EXCEEDED");
    expect(notice.message).toContain("withheld");
    expect(notice.message).not.toContain("cumulative token usage (0) reached");
  });

  it("refuses without projecting once the run has already stopped", () => {
    const tracker = createBudgetTracker(1, "stop");
    reserveBudget(tracker, entries(2), context);
    const again = reserveBudget(tracker, entries(2), context);

    expect(again.reservation).toBeUndefined();
    expect(again.refusedProjection).toBeUndefined();
  });
});
