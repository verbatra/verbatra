import type { RpcMethodName, RpcParamsFor } from "../shared/rpc/contract.js";
import { uniqueByIdentity } from "../shared/rpc/entry-identity.js";
import type { StudioRateLimits } from "../shared/rpc/snapshot.js";
import { resolveErrorCopy } from "./error-copy.js";
import type { RpcCallResult, RpcClient } from "./rpc-client.js";

interface BudgetRule {
  readonly bucket: string;
  readonly limit: keyof StudioRateLimits;
  readonly perEntry: boolean;
}

const RETRANSLATE_BUCKET = "retranslate";

const BUDGET_RULES: Readonly<Record<string, BudgetRule>> = {
  "translation.retranslateEntry": {
    bucket: RETRANSLATE_BUCKET,
    limit: "retranslate",
    perEntry: false,
  },
  "translation.retranslateEntries": {
    bucket: RETRANSLATE_BUCKET,
    limit: "retranslate",
    perEntry: true,
  },
  "review.approve": { bucket: "review.approve", limit: "reviewDecision", perEntry: false },
  "review.reject": { bucket: "review.reject", limit: "reviewDecision", perEntry: false },
  "review.approveMany": { bucket: "review.approveMany", limit: "reviewDecision", perEntry: false },
  "review.rejectMany": { bucket: "review.rejectMany", limit: "reviewDecision", perEntry: false },
};

const UNCOUNTED_CODES: ReadonlySet<string> = new Set([
  "METHOD_RATE_LIMITED",
  "BATCH_TOO_LARGE",
  "ALREADY_IN_PROGRESS",
  "PARAMS_INVALID",
  "METHOD_UNKNOWN",
  "SPEND_DISABLED",
  "REQUEST_INVALID",
  "SESSION_EXPIRED",
]);

const MAX_TRACKED_CALLS = 1_000;

export type BudgetVerdict =
  | { readonly kind: "unknown" }
  | { readonly kind: "within" }
  | { readonly kind: "too-large" }
  | { readonly kind: "exhausted"; readonly retryAfterSeconds: number };

export interface RateBudget {
  record(method: string, params: unknown, sentAt: number, response: RpcCallResult<never>): void;
  check(
    method: string,
    params: unknown,
    limits: StudioRateLimits | undefined,
    now: number,
  ): BudgetVerdict;
}

function weightOf(rule: BudgetRule, params: unknown): number {
  if (!rule.perEntry) {
    return 1;
  }
  const entries = (params as { readonly entries?: unknown }).entries;
  return Array.isArray(entries) ? uniqueByIdentity(entries).length : 1;
}

function counted(response: RpcCallResult<never>): boolean {
  return response.ok || !UNCOUNTED_CODES.has(response.error.code);
}

export function createRateBudget(): RateBudget {
  const calls = new Map<string, number[]>();

  return {
    record(method, params, sentAt, response): void {
      const rule = BUDGET_RULES[method];
      if (rule === undefined || !counted(response)) {
        return;
      }
      const recorded = calls.get(rule.bucket) ?? [];
      for (let slot = 0; slot < weightOf(rule, params); slot += 1) {
        recorded.push(sentAt);
      }
      recorded.sort((a, b) => a - b);
      calls.set(rule.bucket, recorded.slice(-MAX_TRACKED_CALLS));
    },
    check(method, params, limits, now): BudgetVerdict {
      const rule = BUDGET_RULES[method];
      if (rule === undefined || limits === undefined) {
        return { kind: "unknown" };
      }
      const limit = limits[rule.limit];
      const weight = weightOf(rule, params);
      if (weight > limit.max) {
        return { kind: "too-large" };
      }
      const within = (calls.get(rule.bucket) ?? []).filter(
        (sentAt) => sentAt > now - limit.windowMs,
      );
      const releasing = within[within.length + weight - limit.max - 1];
      if (releasing === undefined) {
        return { kind: "within" };
      }
      const retryAfterMs = releasing + limit.windowMs - now;
      return { kind: "exhausted", retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)) };
    },
  };
}

export function budgetRefusal(verdict: BudgetVerdict): string | undefined {
  if (verdict.kind === "too-large") {
    return resolveErrorCopy({ code: "BATCH_TOO_LARGE", message: "" });
  }
  if (verdict.kind === "exhausted") {
    return resolveErrorCopy({
      code: "METHOD_RATE_LIMITED",
      message: "",
      retryAfterSeconds: verdict.retryAfterSeconds,
    });
  }
  return undefined;
}

export function budgetTracking(
  client: RpcClient,
  budget: RateBudget,
  now: () => number = Date.now,
): RpcClient {
  return {
    async call<M extends RpcMethodName>(
      method: M,
      params: RpcParamsFor<M>,
    ): Promise<RpcCallResult<M>> {
      const sentAt = now();
      const response = await client.call(method, params);
      budget.record(method, params, sentAt, response as RpcCallResult<never>);
      return response;
    },
  };
}
