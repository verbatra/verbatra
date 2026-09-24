import { resolveErrorCopy } from "./error-copy.js";
import type { RpcCallResult } from "./rpc-client.js";
import { settledActionStatusLabel } from "./settled-action-status.js";

export type BatchAction = "approve" | "reject" | "retranslate";

export interface BatchFailure {
  readonly locale: string;
  readonly key: string;
  readonly message: string;
}

export type BatchSummary =
  | {
      readonly kind: "done";
      readonly action: BatchAction;
      readonly succeeded: number;
      readonly failures: readonly BatchFailure[];
    }
  | { readonly kind: "error"; readonly action: BatchAction; readonly message: string };

type ReviewBatchResponse = RpcCallResult<"review.approveMany" | "review.rejectMany">;

type RetranslateBatchResponse = RpcCallResult<"translation.retranslateEntries">;

type RetranslateBatchOutcome = Extract<
  RetranslateBatchResponse,
  { ok: true }
>["result"]["results"][number];

function failureOf(outcome: {
  readonly locale: string;
  readonly key: string;
  readonly code: string;
  readonly message: string;
}): BatchFailure {
  return {
    locale: outcome.locale,
    key: outcome.key,
    message: resolveErrorCopy({ code: outcome.code, message: outcome.message }),
  };
}

function summarize(
  action: BatchAction,
  results: readonly unknown[],
  failures: readonly BatchFailure[],
): BatchSummary {
  return { kind: "done", action, succeeded: results.length - failures.length, failures };
}

export function summarizeReviewBatch(
  action: "approve" | "reject",
  response: ReviewBatchResponse,
): BatchSummary {
  if (!response.ok) {
    return { kind: "error", action, message: resolveErrorCopy(response.error) };
  }
  const failures = response.result.results.flatMap((outcome) =>
    outcome.ok ? [] : [failureOf(outcome)],
  );
  return summarize(action, response.result.results, failures);
}

function retranslateFailure(outcome: RetranslateBatchOutcome): BatchFailure | undefined {
  if (!outcome.ok) {
    return failureOf(outcome);
  }
  if (outcome.result.accepted) {
    return undefined;
  }
  const details = outcome.result.details;
  return {
    locale: outcome.locale,
    key: outcome.key,
    message: settledActionStatusLabel(
      {
        kind: "rejected",
        reason: outcome.result.reason,
        ...(details !== undefined ? { details } : {}),
      },
      "",
    ),
  };
}

export function summarizeRetranslateBatch(response: RetranslateBatchResponse): BatchSummary {
  if (!response.ok) {
    return { kind: "error", action: "retranslate", message: resolveErrorCopy(response.error) };
  }
  const failures = response.result.results.flatMap((outcome) => {
    const failure = retranslateFailure(outcome);
    return failure === undefined ? [] : [failure];
  });
  return summarize("retranslate", response.result.results, failures);
}

const PAST_TENSE: Readonly<Record<BatchAction, string>> = {
  approve: "Approved",
  reject: "Rejected",
  retranslate: "Retranslated",
};

const DONE_NOTE: Readonly<Record<BatchAction, string>> = {
  approve: "The decisions are saved in verbatra.provenance.json.",
  reject:
    "Their translations were removed and the decisions are saved in verbatra.provenance.json.",
  retranslate: "Review the new values, then approve or reject them.",
};

function entries(count: number): string {
  return `${count} ${count === 1 ? "entry" : "entries"}`;
}

function failureList(failures: readonly BatchFailure[]): string {
  return failures
    .map((failure) => `${failure.key} (${failure.locale}): ${failure.message}`)
    .join("; ");
}

export function batchSummaryFailed(summary: BatchSummary): boolean {
  return summary.kind === "error" || summary.failures.length > 0;
}

export function batchSummaryText(summary: BatchSummary): string {
  if (summary.kind === "error") {
    return `Could not ${summary.action} the selected entries: ${summary.message}`;
  }
  const done =
    summary.succeeded > 0
      ? `${PAST_TENSE[summary.action]} ${entries(summary.succeeded)}. ${DONE_NOTE[summary.action]}`
      : "";
  if (summary.failures.length === 0) {
    return done;
  }
  const failed = `Could not ${summary.action} ${entries(summary.failures.length)}: ${failureList(summary.failures)}`;
  return done === "" ? failed : `${done} ${failed}`;
}
