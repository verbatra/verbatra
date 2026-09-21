import type { BudgetBehavior, BudgetStanding, RunBudget, UsageSummary } from "@verbatra/sdk";
import type { RpcResultFor } from "../shared/rpc/contract.js";
import type { RpcCallResult } from "./rpc-client.js";
import type { FetchOutcome } from "./state.js";

export type UsageTickerData = RpcResultFor<"usage.summary">;

export type UsageDisplay =
  | { readonly kind: "reported"; readonly inputTokens: number; readonly outputTokens: number }
  | { readonly kind: "not-reported" };

export type BudgetDisplay =
  | { readonly kind: "none" }
  | {
      readonly kind: "tracked";
      readonly maxTokens: number;
      readonly behavior: BudgetBehavior;
      readonly tokensUsed: number;
      readonly standing: BudgetStanding;
      readonly counting: "reported" | "estimated";
    };

export type UsageTickerDisplayState =
  | { readonly kind: "unavailable" }
  | {
      readonly kind: "available";
      readonly generatedAt: string;
      readonly usage: UsageDisplay;
      readonly budget: BudgetDisplay;
    };

function toUsageDisplay(usage: UsageSummary | undefined): UsageDisplay {
  if (usage === undefined) {
    return { kind: "not-reported" };
  }
  return { kind: "reported", inputTokens: usage.inputTokens, outputTokens: usage.outputTokens };
}

function budgetStanding(budget: RunBudget): BudgetStanding {
  if (!budget.exceeded) {
    return "within";
  }
  return budget.behavior === "stop" && budget.tokensUsed < budget.maxTokens
    ? "stopped-before-ceiling"
    : "reached";
}

function toBudgetDisplay(budget: RunBudget | undefined): BudgetDisplay {
  if (budget === undefined) {
    return { kind: "none" };
  }
  return {
    kind: "tracked",
    maxTokens: budget.maxTokens,
    behavior: budget.behavior,
    tokensUsed: budget.tokensUsed,
    standing: budgetStanding(budget),
    counting: budget.supported || budget.tokensUsed === 0 ? "reported" : "estimated",
  };
}

export function toUsageTickerDisplayState(data: UsageTickerData): UsageTickerDisplayState {
  if (!data.available) {
    return { kind: "unavailable" };
  }
  return {
    kind: "available",
    generatedAt: data.generatedAt,
    usage: toUsageDisplay(data.usage),
    budget: toBudgetDisplay(data.budget),
  };
}

export function budgetPercent(budget: {
  readonly tokensUsed: number;
  readonly maxTokens: number;
}): number {
  if (budget.maxTokens <= 0) {
    return 100;
  }
  return Math.min(100, Math.round((budget.tokensUsed / budget.maxTokens) * 100));
}

export function toUsageTickerOutcome(
  response: RpcCallResult<"usage.summary">,
): FetchOutcome<UsageTickerData> {
  if (!response.ok) {
    return { ok: false, error: response.error };
  }
  return { ok: true, result: response.result };
}
