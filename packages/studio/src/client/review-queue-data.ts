import type { MachineClassOrigin, ReviewReasonCode } from "@verbatra/sdk";
import type { RpcResultFor } from "../shared/rpc/contract.js";
import type { KeyValuePair } from "./filter.js";
import { reviewValuesKey } from "./review-filter.js";
import type { RpcCallResult } from "./rpc-client.js";
import type { FetchOutcome } from "./state.js";

export type ReviewQueueData = RpcResultFor<"review.queue">;

export interface ReviewEntryRef {
  readonly locale: string;
  readonly key: string;
}

export type QueueReviewState = "unreviewed" | "approved";

export interface ReviewQueueRow extends ReviewEntryRef {
  readonly reasons: readonly ReviewReasonCode[];
  readonly origin: MachineClassOrigin;
  readonly reviewState: QueueReviewState;
}

type QueueEntry = Extract<
  ReviewQueueData,
  { available: true }
>["locales"][number]["needsReview"][number];

function toRow(locale: string, entry: QueueEntry, reviewState: QueueReviewState): ReviewQueueRow {
  return {
    locale,
    key: entry.key,
    reasons: entry.reasons,
    origin: entry.provenance.origin,
    reviewState,
  };
}

export function flattenReviewQueue(data: ReviewQueueData): readonly ReviewQueueRow[] {
  if (!data.available) {
    return [];
  }
  return data.locales.flatMap((locale) => [
    ...locale.needsReview.map((entry) => toRow(locale.locale, entry, "unreviewed")),
    ...(locale.approved ?? []).map((entry) => toRow(locale.locale, entry, "approved")),
  ]);
}

export function unreviewedRows(data: ReviewQueueData): readonly ReviewQueueRow[] {
  return flattenReviewQueue(data).filter((row) => row.reviewState === "unreviewed");
}

export function toReviewQueueOutcome(
  response: RpcCallResult<"review.queue">,
): FetchOutcome<ReviewQueueData> {
  if (!response.ok) {
    return { ok: false, error: response.error };
  }
  return { ok: true, result: response.result };
}

export function reviewedValueFor(
  values: ReadonlyMap<string, KeyValuePair>,
  row: ReviewEntryRef,
): string | undefined {
  return values.get(reviewValuesKey(row.locale, row.key))?.target;
}

export function reviewedSourceFor(
  values: ReadonlyMap<string, KeyValuePair>,
  row: ReviewEntryRef,
): string | undefined {
  return values.get(reviewValuesKey(row.locale, row.key))?.source;
}
