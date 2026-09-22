import type { Usage } from "@verbatra/ai-providers";
import type { TranslationEntry } from "@verbatra/core";
import { type PayloadContext, quantifyBatch } from "./estimate.js";
import type { BudgetBehavior, RunBudget, SdkNotice } from "./summary.js";
import { countableUsage } from "./usage.js";

export interface BudgetTracker {
  readonly maxTokens: number | undefined;
  readonly behavior: BudgetBehavior;
  tokensUsed: number;
  usageSeen: boolean;
  estimatedSeen: boolean;
  exceeded: boolean;
  stopped: boolean;
}

export interface BudgetReservation {
  readonly projected: number;
}

export interface BudgetDecision {
  readonly reservation: BudgetReservation | undefined;
  readonly refusedProjection: number | undefined;
}

const UNBUDGETED: BudgetReservation = { projected: 0 };

export function createBudgetTracker(
  maxTokens: number | undefined,
  behavior: BudgetBehavior,
): BudgetTracker {
  return {
    maxTokens,
    behavior,
    tokensUsed: 0,
    usageSeen: false,
    estimatedSeen: false,
    exceeded: false,
    stopped: false,
  };
}

export function projectBatchTokens(
  entries: readonly TranslationEntry[],
  context: PayloadContext,
): number {
  const quantity = quantifyBatch(entries, context);
  return quantity.inputTokens + quantity.outputTokens;
}

const UNBUDGETED_DECISION: BudgetDecision = {
  reservation: UNBUDGETED,
  refusedProjection: undefined,
};
const ALREADY_STOPPED: BudgetDecision = { reservation: undefined, refusedProjection: undefined };

export function reserveBudget(
  tracker: BudgetTracker,
  entries: readonly TranslationEntry[],
  context: PayloadContext,
): BudgetDecision {
  if (tracker.maxTokens === undefined) {
    return UNBUDGETED_DECISION;
  }
  if (tracker.stopped) {
    return ALREADY_STOPPED;
  }
  const projected = projectBatchTokens(entries, context);
  if (tracker.behavior === "stop" && tracker.tokensUsed + projected > tracker.maxTokens) {
    tracker.exceeded = true;
    tracker.stopped = true;
    return { reservation: undefined, refusedProjection: projected };
  }
  tracker.tokensUsed += projected;
  return { reservation: { projected }, refusedProjection: undefined };
}

export function reconcileBudget(
  tracker: BudgetTracker,
  reservation: BudgetReservation,
  usage: Usage | undefined,
): void {
  const counted = usage === undefined ? undefined : countableUsage(usage);
  const reported = counted === undefined ? 0 : counted.inputTokens + counted.outputTokens;
  if (reported <= 0) {
    tracker.estimatedSeen = true;
    return;
  }
  tracker.usageSeen = true;
  tracker.tokensUsed += reported - reservation.projected;
}

export function checkBudgetTrip(tracker: BudgetTracker): boolean {
  if (
    tracker.maxTokens === undefined ||
    tracker.exceeded ||
    tracker.tokensUsed < tracker.maxTokens
  ) {
    return false;
  }
  tracker.exceeded = true;
  if (tracker.behavior === "stop") {
    tracker.stopped = true;
  }
  return true;
}

/**
 * Where a finished run stands against its token budget.
 *
 * - `within`: the run never reached its ceiling.
 * - `stopped-before-ceiling`: under `stop`, a request was withheld because sending it would have
 *   passed the ceiling, while the counted total was still below it.
 * - `reached`: the counted total reached or passed the ceiling.
 */
export type BudgetStanding = "within" | "stopped-before-ceiling" | "reached";

/**
 * Classifies a {@link RunBudget} into its {@link BudgetStanding}, so every surface that reports a
 * budget tells a `stop` run halted short of its ceiling apart from one that actually reached it.
 *
 * @param budget - The budget from {@link RunSummary.budget} or {@link RunStatusFile.budget}.
 * @returns The standing. Pure; throws nothing.
 */
export function budgetStanding(budget: RunBudget): BudgetStanding {
  if (!budget.exceeded) {
    return "within";
  }
  return budget.behavior === "stop" && budget.tokensUsed < budget.maxTokens
    ? "stopped-before-ceiling"
    : "reached";
}

export function toBudgetSummary(tracker: BudgetTracker): RunBudget | undefined {
  if (tracker.maxTokens === undefined) {
    return undefined;
  }
  return {
    maxTokens: tracker.maxTokens,
    behavior: tracker.behavior,
    supported: tracker.usageSeen && !tracker.estimatedSeen,
    tokensUsed: tracker.tokensUsed,
    exceeded: tracker.exceeded,
  };
}

export function budgetExceededNotice(tracker: BudgetTracker): SdkNotice {
  return {
    code: "BUDGET_TOKENS_EXCEEDED",
    message:
      `The run's cumulative token usage (${tracker.tokensUsed}) reached the configured budget of ` +
      `${tracker.maxTokens} tokens (behavior: ${tracker.behavior}).`,
  };
}

function oversizedRequestHint(tracker: BudgetTracker, projected: number): string {
  return tracker.maxTokens !== undefined && projected > tracker.maxTokens
    ? " That request alone is projected above the whole budget, so it is refused on every run: " +
        "lower maxBatchSize or raise maxTokens."
    : "";
}

export function budgetWithheldNotice(tracker: BudgetTracker, projected: number): SdkNotice {
  return {
    code: "BUDGET_TOKENS_EXCEEDED",
    message:
      `The run's next provider request was projected at ${projected} tokens on top of the ` +
      `${tracker.tokensUsed} already counted, which would have crossed the configured budget of ` +
      `${tracker.maxTokens} tokens, so it was withheld rather than sent ` +
      `(behavior: ${tracker.behavior}).${oversizedRequestHint(tracker, projected)}`,
  };
}

export function budgetAlreadyStoppedNotice(tracker: BudgetTracker): SdkNotice {
  return {
    code: "BUDGET_TOKENS_EXCEEDED",
    message:
      `The run had already reached its configured budget of ${tracker.maxTokens} tokens ` +
      `(${tracker.tokensUsed} counted, behavior: ${tracker.behavior}), ` +
      "so this locale's keys were withheld rather than sent.",
  };
}
