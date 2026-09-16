import { describe, expect, it } from "vitest";
import {
  budgetPercent,
  toUsageTickerDisplayState,
  toUsageTickerOutcome,
  type UsageTickerData,
} from "./usage-ticker-data.js";

describe("budgetPercent", () => {
  it("computes a rounded consumed percentage", () => {
    expect(budgetPercent({ tokensUsed: 460, maxTokens: 1000 })).toBe(46);
    expect(budgetPercent({ tokensUsed: 1, maxTokens: 3 })).toBe(33);
  });

  it("clamps an exceeded budget to 100", () => {
    expect(budgetPercent({ tokensUsed: 1500, maxTokens: 1000 })).toBe(100);
  });

  it("treats a non-positive ceiling as fully consumed, never a division by zero", () => {
    expect(budgetPercent({ tokensUsed: 0, maxTokens: 0 })).toBe(100);
  });
});

describe("toUsageTickerDisplayState", () => {
  it("maps available: false to the unavailable display state", () => {
    const state = toUsageTickerDisplayState({ available: false });
    expect(state).toEqual({ kind: "unavailable" });
  });

  it("maps a result with both usage and a tracked budget present to reported usage and a tracked budget", () => {
    const data: UsageTickerData = {
      available: true,
      generatedAt: "2026-07-16T00:00:00.000Z",
      usage: { inputTokens: 120, outputTokens: 340 },
      budget: {
        maxTokens: 1000,
        behavior: "warn",
        supported: true,
        tokensUsed: 460,
        exceeded: false,
      },
    };

    const state = toUsageTickerDisplayState(data);

    expect(state).toEqual({
      kind: "available",
      generatedAt: "2026-07-16T00:00:00.000Z",
      usage: { kind: "reported", inputTokens: 120, outputTokens: 340 },
      budget: {
        kind: "tracked",
        maxTokens: 1000,
        behavior: "warn",
        tokensUsed: 460,
        exceeded: false,
        counting: "reported",
      },
    });
  });

  it("maps a result with usage absent to the not-reported usage state, never a fabricated zero", () => {
    const data: UsageTickerData = {
      available: true,
      generatedAt: "2026-07-16T00:00:00.000Z",
      budget: {
        maxTokens: 1000,
        behavior: "stop",
        supported: false,
        tokensUsed: 0,
        exceeded: false,
      },
    };

    const state = toUsageTickerDisplayState(data);

    expect(state.kind).toBe("available");
    if (state.kind === "available") {
      expect(state.usage).toEqual({ kind: "not-reported" });
    }
  });

  it("keeps an estimated budget tracked, carrying the consumption and the ceiling-reached flag", () => {
    const data: UsageTickerData = {
      available: true,
      generatedAt: "2026-07-16T00:00:00.000Z",
      budget: {
        maxTokens: 500,
        behavior: "stop",
        supported: false,
        tokensUsed: 494,
        exceeded: true,
      },
    };

    const state = toUsageTickerDisplayState(data);

    expect(state.kind).toBe("available");
    if (state.kind === "available") {
      expect(state.budget).toEqual({
        kind: "tracked",
        maxTokens: 500,
        behavior: "stop",
        tokensUsed: 494,
        exceeded: true,
        counting: "estimated",
      });
    }
  });

  it("does not call a budget estimated when the run counted nothing at all", () => {
    const data: UsageTickerData = {
      available: true,
      generatedAt: "2026-07-16T00:00:00.000Z",
      budget: {
        maxTokens: 500,
        behavior: "warn",
        supported: false,
        tokensUsed: 0,
        exceeded: false,
      },
    };

    const state = toUsageTickerDisplayState(data);

    expect(state.kind).toBe("available");
    if (state.kind === "available") {
      expect(state.budget).toEqual({
        kind: "tracked",
        maxTokens: 500,
        behavior: "warn",
        tokensUsed: 0,
        exceeded: false,
        counting: "reported",
      });
    }
  });

  it("marks a provider-reported budget as reported rather than estimated", () => {
    const data: UsageTickerData = {
      available: true,
      generatedAt: "2026-07-16T00:00:00.000Z",
      budget: {
        maxTokens: 500,
        behavior: "warn",
        supported: true,
        tokensUsed: 120,
        exceeded: false,
      },
    };

    const state = toUsageTickerDisplayState(data);

    expect(state.kind).toBe("available");
    if (state.kind === "available") {
      expect(state.budget).toEqual({
        kind: "tracked",
        maxTokens: 500,
        behavior: "warn",
        tokensUsed: 120,
        exceeded: false,
        counting: "reported",
      });
    }
  });

  it("maps a result with budget absent to the none budget state", () => {
    const data: UsageTickerData = {
      available: true,
      generatedAt: "2026-07-16T00:00:00.000Z",
      usage: { inputTokens: 5, outputTokens: 7 },
    };

    const state = toUsageTickerDisplayState(data);

    expect(state.kind).toBe("available");
    if (state.kind === "available") {
      expect(state.budget).toEqual({ kind: "none" });
    }
  });
});

describe("toUsageTickerOutcome", () => {
  it("maps an ok rpc result to a successful fetch outcome", () => {
    const outcome = toUsageTickerOutcome({ ok: true, result: { available: false } });
    expect(outcome).toEqual({ ok: true, result: { available: false } });
  });

  it("maps a failed rpc result to a failed fetch outcome, carrying the structured error unchanged", () => {
    const outcome = toUsageTickerOutcome({
      ok: false,
      error: { code: "SESSION_EXPIRED", message: "expired" },
    });
    expect(outcome).toEqual({
      ok: false,
      error: { code: "SESSION_EXPIRED", message: "expired" },
    });
  });
});
