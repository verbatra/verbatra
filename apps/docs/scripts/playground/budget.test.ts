import { describe, expect, it } from "vitest";
import { ATTEMPTS_PER_EVENT, createBudget } from "./budget.ts";

const subBatch = { type: "sub-batch", locale: "de", batchIndex: 1, totalBatches: 1 } as const;

describe("createBudget", () => {
  it("counts sub-batches, repairs and provider retries as attempts", () => {
    const budget = createBudget(20);
    budget.onProgress(subBatch);
    budget.onProgress({ type: "repair", locale: "de", keys: 1 });
    budget.onProgress({ type: "provider-retry", attempt: 2, status: 503 });
    budget.onProgress({ type: "locale-started", locale: "de", localeIndex: 0, totalLocales: 1 });
    expect(budget.attempts()).toBe(3);
    expect(budget.controller.signal.aborted).toBe(false);
  });

  it("counts a truncation split as two attempts, one per resent half", () => {
    const budget = createBudget(20);
    budget.onProgress(subBatch);
    budget.onProgress({ type: "split-retry", locale: "de", keys: 10 });
    budget.onProgress({ type: "split-retry", locale: "de", keys: 5 });
    expect(budget.attempts()).toBe(5);
  });

  it("stops before a split whose halves would pass the cap", () => {
    const budget = createBudget(2);
    budget.onProgress(subBatch);
    budget.onProgress({ type: "split-retry", locale: "de", keys: 2 });
    expect(budget.stopReason()).toBe("attempt-cap");
  });

  it("weights every event kind that resends to the provider and no other", () => {
    expect(ATTEMPTS_PER_EVENT).toEqual({
      "sub-batch": 1,
      repair: 1,
      "provider-retry": 1,
      "split-retry": 2,
    });
  });

  it.each(["failed", "partial"] as const)(
    "aborts when a locale finishes %s, so a provider failure stops the run",
    (status) => {
      const budget = createBudget(20);
      budget.onProgress({
        type: "locale-finished",
        locale: "de",
        status,
        translated: 0,
        localeIndex: 0,
        totalLocales: 4,
      });
      expect(budget.controller.signal.aborted).toBe(true);
      expect(budget.stopReason()).toBe("locale-incomplete");
    },
  );

  it("does not abort when a locale succeeds", () => {
    const budget = createBudget(20);
    budget.onProgress({
      type: "locale-finished",
      locale: "de",
      status: "succeeded",
      translated: 10,
      localeIndex: 0,
      totalLocales: 4,
    });
    expect(budget.controller.signal.aborted).toBe(false);
  });

  it("aborts at the attempt cap, on the first attempt past it", () => {
    const budget = createBudget(2);
    budget.onProgress(subBatch);
    budget.onProgress(subBatch);
    expect(budget.controller.signal.aborted).toBe(false);
    budget.onProgress(subBatch);
    expect(budget.controller.signal.aborted).toBe(true);
    expect(budget.stopReason()).toBe("attempt-cap");
  });

  it("aborts on the first provider retry with status 429", () => {
    const budget = createBudget(20);
    budget.onProgress({ type: "provider-retry", attempt: 2, delayMs: 250, status: 429 });
    expect(budget.controller.signal.aborted).toBe(true);
    expect(budget.stopReason()).toBe("rate-limited");
  });

  it("keeps the first stop reason", () => {
    const budget = createBudget(0);
    budget.onProgress(subBatch);
    budget.onProgress({ type: "provider-retry", attempt: 2, status: 429 });
    expect(budget.stopReason()).toBe("attempt-cap");
  });
});
