import { describe, expect, it } from "vitest";
import type { StudioRateLimits } from "../shared/rpc/snapshot.js";
import { budgetRefusal, budgetTracking, createRateBudget } from "./rate-budget.js";
import type { RpcCallResult, RpcClient } from "./rpc-client.js";

const LIMITS: StudioRateLimits = {
  retranslate: { windowMs: 60_000, max: 3 },
  reviewDecision: { windowMs: 10_000, max: 2 },
};

const OK = { ok: true, result: {} } as unknown as RpcCallResult<never>;

function failed(code: string): RpcCallResult<never> {
  return { ok: false, error: { code, message: code } };
}

function entries(...keys: string[]): { entries: { locale: string; key: string }[] } {
  return { entries: keys.map((key) => ({ locale: "de", key })) };
}

describe("createRateBudget: check", () => {
  it("knows nothing without limits or for a method it does not track", () => {
    const budget = createRateBudget();

    expect(budget.check("review.approveMany", {}, undefined, 0)).toEqual({ kind: "unknown" });
    expect(budget.check("status.check", {}, LIMITS, 0)).toEqual({ kind: "unknown" });
  });

  it("counts a retranslation batch per distinct entry, shared with single retranslations", () => {
    const budget = createRateBudget();
    budget.record("translation.retranslateEntry", { locale: "de", key: "a" }, 0, OK);

    expect(
      budget.check("translation.retranslateEntries", entries("b", "c", "c"), LIMITS, 1),
    ).toEqual({ kind: "within" });
    budget.record("translation.retranslateEntries", entries("b", "c", "c"), 1_000, OK);

    expect(budget.check("translation.retranslateEntries", entries("d"), LIMITS, 2_000)).toEqual({
      kind: "exhausted",
      retryAfterSeconds: 58,
    });
    expect(
      budget.check("translation.retranslateEntries", entries("d", "e"), LIMITS, 2_000),
    ).toEqual({ kind: "exhausted", retryAfterSeconds: 59 });
    expect(budget.check("translation.retranslateEntries", entries("d"), LIMITS, 60_000)).toEqual({
      kind: "within",
    });
  });

  it("calls a batch larger than the whole window too large", () => {
    const budget = createRateBudget();

    expect(
      budget.check("translation.retranslateEntries", entries("a", "b", "c", "d"), LIMITS, 0),
    ).toEqual({ kind: "too-large" });
  });

  it("counts each review batch as one call in its own method's budget", () => {
    const budget = createRateBudget();
    budget.record("review.approveMany", entries("a", "b", "c"), 0, OK);
    budget.record("review.approveMany", entries("d"), 500, OK);

    expect(budget.check("review.approveMany", entries("e"), LIMITS, 1_000)).toEqual({
      kind: "exhausted",
      retryAfterSeconds: 9,
    });
    expect(budget.check("review.rejectMany", entries("e"), LIMITS, 1_000)).toEqual({
      kind: "within",
    });
  });

  it("tracks approving a whole locale in its own budget, as the server limits it", () => {
    const budget = createRateBudget();
    const params = { locale: "de" };
    budget.record("review.approveLocale", params, 0, OK);
    budget.record("review.approveLocale", params, 500, OK);

    expect(budget.check("review.approveLocale", params, LIMITS, 1_000)).toEqual({
      kind: "exhausted",
      retryAfterSeconds: 9,
    });
    expect(budget.check("review.approve", params, LIMITS, 1_000)).toEqual({ kind: "within" });
  });

  it("never reports less than a second to wait", () => {
    const budget = createRateBudget();
    budget.record("review.rejectMany", {}, 0, OK);
    budget.record("review.rejectMany", {}, 0, OK);

    expect(budget.check("review.rejectMany", {}, LIMITS, 9_999)).toEqual({
      kind: "exhausted",
      retryAfterSeconds: 1,
    });
  });

  it.each([
    "METHOD_RATE_LIMITED",
    "BATCH_TOO_LARGE",
    "ALREADY_IN_PROGRESS",
    "PARAMS_INVALID",
    "SESSION_EXPIRED",
  ])("does not count a call the server refused with %s before running it", (code) => {
    const budget = createRateBudget();
    budget.record("review.approve", {}, 0, failed(code));
    budget.record("review.approve", {}, 0, failed(code));

    expect(budget.check("review.approve", {}, LIMITS, 1)).toEqual({ kind: "within" });
  });

  it("counts a call whose handler failed, since the server spent the slot", () => {
    const budget = createRateBudget();
    budget.record("review.reject", {}, 0, failed("REVIEW_VALUE_CHANGED"));
    budget.record("review.reject", {}, 0, failed("INTERNAL"));

    expect(budget.check("review.reject", {}, LIMITS, 1).kind).toBe("exhausted");
  });

  it("ignores a call to a method it does not track", () => {
    const budget = createRateBudget();
    budget.record("status.check", {}, 0, OK);

    expect(budget.check("status.check", {}, LIMITS, 1)).toEqual({ kind: "unknown" });
  });

  it("counts a retranslation batch without an entries list as one entry", () => {
    const budget = createRateBudget();
    budget.record("translation.retranslateEntries", {}, 0, OK);
    budget.record("translation.retranslateEntries", entries("a", "b"), 0, OK);

    expect(budget.check("translation.retranslateEntries", entries("c"), LIMITS, 1).kind).toBe(
      "exhausted",
    );
  });
});

describe("budgetRefusal", () => {
  it("says nothing when the call may go ahead", () => {
    expect(budgetRefusal({ kind: "unknown" })).toBeUndefined();
    expect(budgetRefusal({ kind: "within" })).toBeUndefined();
  });

  it("gives the limit message with the retry time for an exhausted budget", () => {
    expect(budgetRefusal({ kind: "exhausted", retryAfterSeconds: 12 })).toBe(
      "Studio is limiting how often this action can run. Try again in 12 seconds.",
    );
  });

  it("gives the batch size message for a batch larger than the window", () => {
    expect(budgetRefusal({ kind: "too-large" })).toBe(
      "This batch has more entries than Studio allows in one rate-limit window. Select fewer entries and try again.",
    );
  });
});

describe("budgetTracking", () => {
  it("records each call with the time it was sent and passes the response through", async () => {
    const budget = createRateBudget();
    let clock = 5_000;
    const inner = {
      call: async () => {
        clock = 9_000;
        return OK;
      },
    } as unknown as RpcClient;
    const client = budgetTracking(inner, budget, () => clock);

    await expect(client.call("translation.retranslateEntries", entries("a"))).resolves.toBe(OK);
    await client.call("translation.retranslateEntries", entries("b", "c"));

    expect(budget.check("translation.retranslateEntries", entries("d"), LIMITS, 9_000)).toEqual({
      kind: "exhausted",
      retryAfterSeconds: 56,
    });
  });
});
