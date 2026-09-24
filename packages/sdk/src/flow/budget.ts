import type { Usage } from "@verbatra/ai-providers";
import type { TranslationEntry } from "@verbatra/core";
import { SdkError } from "../errors.js";
import { type PayloadContext, quantifyBatch } from "./estimate.js";
import type { BudgetBehavior, RunBudget, SdkNotice } from "./summary.js";
import { countableUsage } from "./usage.js";

export type BudgetSource = "config" | "run";

export interface BudgetTracker {
  readonly maxTokens: number | undefined;
  readonly behavior: BudgetBehavior;
  readonly source: BudgetSource;
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

export interface RunBudgetSettings {
  readonly maxTokens: number | undefined;
  readonly behavior: BudgetBehavior;
  readonly source: BudgetSource;
}

export interface ConfiguredBudget {
  readonly maxTokens?: number | undefined;
  readonly budgetBehavior?: BudgetBehavior | undefined;
}

function assertValidMaxTokensOverride(value: number): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new SdkError(
      "MAX_TOKENS_INVALID",
      `The maxTokens option must be a whole number of at least 1, got ${value}.`,
    );
  }
}

export function resolveRunBudget(
  configured: ConfiguredBudget,
  defaultBehavior: BudgetBehavior,
  override: number | undefined,
): RunBudgetSettings {
  const behavior = configured.budgetBehavior ?? defaultBehavior;
  if (override === undefined) {
    return { maxTokens: configured.maxTokens, behavior, source: "config" };
  }
  assertValidMaxTokensOverride(override);
  if (configured.maxTokens !== undefined && configured.maxTokens < override) {
    return { maxTokens: configured.maxTokens, behavior: "stop", source: "config" };
  }
  return { maxTokens: override, behavior: "stop", source: "run" };
}

export function createBudgetTracker(
  maxTokens: number | undefined,
  behavior: BudgetBehavior,
  source: BudgetSource = "config",
): BudgetTracker {
  return {
    maxTokens,
    behavior,
    source,
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

function tokenCount(count: number | undefined): string {
  return `${count} ${count === 1 ? "token" : "tokens"}`;
}

function budgetLabel(tracker: BudgetTracker): string {
  return tracker.source === "run" ? "the run's own budget" : "the configured budget";
}

function raiseCeilingAdvice(tracker: BudgetTracker): string {
  return tracker.source === "run"
    ? "raise the run's maxTokens (--max-tokens)"
    : "raise maxTokens in the config";
}

export function budgetExceededNotice(tracker: BudgetTracker): SdkNotice {
  return {
    code: "BUDGET_TOKENS_EXCEEDED",
    message:
      `The run's cumulative token usage (${tracker.tokensUsed}) reached ${budgetLabel(tracker)} of ` +
      `${tokenCount(tracker.maxTokens)} (behavior: ${tracker.behavior}).`,
  };
}

function oversizedRequestHint(tracker: BudgetTracker, projected: number): string {
  return tracker.maxTokens !== undefined && projected > tracker.maxTokens
    ? " That request alone is projected above the whole budget, so it is refused on every run: " +
        `lower maxBatchSize or ${raiseCeilingAdvice(tracker)}.`
    : "";
}

export function budgetWithheldNotice(tracker: BudgetTracker, projected: number): SdkNotice {
  return {
    code: "BUDGET_TOKENS_EXCEEDED",
    message:
      `The run's next provider request was projected at ${tokenCount(projected)} on top of the ` +
      `${tracker.tokensUsed} already counted, which would have crossed ${budgetLabel(tracker)} of ` +
      `${tokenCount(tracker.maxTokens)}, so it was withheld rather than sent ` +
      `(behavior: ${tracker.behavior}).${oversizedRequestHint(tracker, projected)}`,
  };
}

function stoppedStanding(tracker: BudgetTracker): string {
  return tracker.maxTokens !== undefined && tracker.tokensUsed < tracker.maxTokens
    ? "stopped short of"
    : "reached";
}

export function budgetAlreadyStoppedNotice(tracker: BudgetTracker): SdkNotice {
  return {
    code: "BUDGET_TOKENS_EXCEEDED",
    message:
      `The run had already ${stoppedStanding(tracker)} ${budgetLabel(tracker)} of ${tokenCount(tracker.maxTokens)} ` +
      `(${tracker.tokensUsed} counted, behavior: ${tracker.behavior}), ` +
      "so this locale's keys were withheld rather than sent.",
  };
}
