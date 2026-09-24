import { describe, expect, it } from "vitest";
import { createRpcRateLimiter } from "./rate-limiter.js";

describe("createRpcRateLimiter", () => {
  it("allows a method with no configured rule unconditionally", () => {
    const limiter = createRpcRateLimiter({});
    expect(limiter.tryAcquire("status.check")).toBe(true);
    expect(limiter.tryAcquire("status.check")).toBe(true);
  });

  it("allows calls up to maxCalls within the window, then trips", () => {
    const now = 0;
    const limiter = createRpcRateLimiter(
      { "translation.retranslateEntry": { windowMs: 1000, maxCalls: 3 } },
      () => now,
    );

    expect(limiter.tryAcquire("translation.retranslateEntry")).toBe(true);
    expect(limiter.tryAcquire("translation.retranslateEntry")).toBe(true);
    expect(limiter.tryAcquire("translation.retranslateEntry")).toBe(true);
    expect(limiter.tryAcquire("translation.retranslateEntry")).toBe(false);
  });

  it("does not consume a slot for a call it rejects (repeated over-limit calls all trip)", () => {
    const now = 0;
    const limiter = createRpcRateLimiter(
      { "translation.retranslateEntry": { windowMs: 1000, maxCalls: 1 } },
      () => now,
    );

    expect(limiter.tryAcquire("translation.retranslateEntry")).toBe(true);
    expect(limiter.tryAcquire("translation.retranslateEntry")).toBe(false);
    expect(limiter.tryAcquire("translation.retranslateEntry")).toBe(false);
  });

  it("allows a call again once the window has rolled past the earlier calls", () => {
    let now = 0;
    const limiter = createRpcRateLimiter(
      { "translation.retranslateEntry": { windowMs: 1000, maxCalls: 1 } },
      () => now,
    );

    expect(limiter.tryAcquire("translation.retranslateEntry")).toBe(true);
    expect(limiter.tryAcquire("translation.retranslateEntry")).toBe(false);
    now = 1001;
    expect(limiter.tryAcquire("translation.retranslateEntry")).toBe(true);
  });

  it("tracks separately configured methods independently", () => {
    const now = 0;
    const limiter = createRpcRateLimiter(
      {
        "translation.retranslateEntry": { windowMs: 1000, maxCalls: 1 },
        "translation.editEntry": { windowMs: 1000, maxCalls: 1 },
      },
      () => now,
    );

    expect(limiter.tryAcquire("translation.retranslateEntry")).toBe(true);
    expect(limiter.tryAcquire("translation.editEntry")).toBe(true);
    expect(limiter.tryAcquire("translation.retranslateEntry")).toBe(false);
    expect(limiter.tryAcquire("translation.editEntry")).toBe(false);
  });
});

describe("createRpcRateLimiter: weighted calls and shared buckets", () => {
  it("counts a call as one call, whatever its entry count, unless the rule is per entry", () => {
    const limiter = createRpcRateLimiter(
      { "review.approveMany": { windowMs: 1000, maxCalls: 2 } },
      () => 0,
    );

    expect(limiter.tryAcquire("review.approveMany", 50)).toBe(true);
    expect(limiter.tryAcquire("review.approveMany", 50)).toBe(true);
    expect(limiter.tryAcquire("review.approveMany", 1)).toBe(false);
  });

  it("counts a per-entry call as one call per entry", () => {
    const limiter = createRpcRateLimiter(
      { "translation.retranslateEntries": { windowMs: 1000, maxCalls: 5, perEntry: true } },
      () => 0,
    );

    expect(limiter.tryAcquire("translation.retranslateEntries", 3)).toBe(true);
    expect(limiter.tryAcquire("translation.retranslateEntries", 3)).toBe(false);
    expect(limiter.tryAcquire("translation.retranslateEntries", 2)).toBe(true);
    expect(limiter.tryAcquire("translation.retranslateEntries")).toBe(false);
  });

  it("refuses a per-entry call larger than the whole budget without consuming anything", () => {
    const limiter = createRpcRateLimiter(
      { "translation.retranslateEntries": { windowMs: 1000, maxCalls: 2, perEntry: true } },
      () => 0,
    );

    expect(limiter.tryAcquire("translation.retranslateEntries", 3)).toBe(false);
    expect(limiter.tryAcquire("translation.retranslateEntries", 2)).toBe(true);
  });

  it("draws two methods that name the same bucket from one budget", () => {
    const limiter = createRpcRateLimiter(
      {
        "translation.retranslateEntry": { windowMs: 1000, maxCalls: 3 },
        "translation.retranslateEntries": {
          windowMs: 1000,
          maxCalls: 3,
          bucket: "translation.retranslateEntry",
          perEntry: true,
        },
      },
      () => 0,
    );

    expect(limiter.tryAcquire("translation.retranslateEntries", 2)).toBe(true);
    expect(limiter.tryAcquire("translation.retranslateEntry")).toBe(true);
    expect(limiter.tryAcquire("translation.retranslateEntry")).toBe(false);
    expect(limiter.tryAcquire("translation.retranslateEntries", 1)).toBe(false);
  });
});

describe("createRpcRateLimiter: how long until a call would fit", () => {
  it("names the time until enough of the oldest calls leave the window", () => {
    let now = 0;
    const limiter = createRpcRateLimiter(
      { "translation.retranslateEntries": { windowMs: 1000, maxCalls: 3, perEntry: true } },
      () => now,
    );

    expect(limiter.retryAfterMs("translation.retranslateEntries", 3)).toBe(0);
    limiter.tryAcquire("translation.retranslateEntries", 1);
    now = 200;
    limiter.tryAcquire("translation.retranslateEntries", 2);
    now = 500;

    expect(limiter.retryAfterMs("translation.retranslateEntries", 1)).toBe(500);
    expect(limiter.retryAfterMs("translation.retranslateEntries", 2)).toBe(700);
    expect(limiter.retryAfterMs("translation.retranslateEntries", 5)).toBe(700);
  });

  it("answers 0 for a method with no rule or with room left", () => {
    const limiter = createRpcRateLimiter(
      { "review.approveMany": { windowMs: 1000, maxCalls: 2 } },
      () => 0,
    );
    limiter.tryAcquire("review.approveMany");

    expect(limiter.retryAfterMs("status.check")).toBe(0);
    expect(limiter.retryAfterMs("review.approveMany")).toBe(0);
  });
});

describe("createRpcRateLimiter: calls that can never fit", () => {
  it("reports a per-entry call heavier than the whole window budget, and nothing else", () => {
    const limiter = createRpcRateLimiter({
      "translation.retranslateEntries": { windowMs: 1000, maxCalls: 3, perEntry: true },
      "translation.retranslateEntry": { windowMs: 1000, maxCalls: 1 },
    });

    expect(limiter.exceedsWindow("translation.retranslateEntries", 4)).toBe(true);
    expect(limiter.exceedsWindow("translation.retranslateEntries", 3)).toBe(false);
    expect(limiter.exceedsWindow("translation.retranslateEntry", 5)).toBe(false);
    expect(limiter.exceedsWindow("translation.retranslateEntry")).toBe(false);
    expect(limiter.exceedsWindow("status.check", 100)).toBe(false);
  });
});
