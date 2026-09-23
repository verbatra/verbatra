import type { ReviewReasonCode } from "@verbatra/sdk";
import type { RpcResultFor } from "../shared/rpc/contract.js";
import type { KeyValuePair } from "./filter.js";
import { reviewValuesKey } from "./review-filter.js";
import type { ReviewOverlayEntry, ReviewOverlayStore } from "./review-overlay.js";
import type { RpcCallResult } from "./rpc-client.js";
import type { FetchOutcome } from "./state.js";

export type ReviewQueueData = RpcResultFor<"review.queue">;

export interface ReviewQueueRow extends ReviewOverlayEntry {
  readonly reasons: readonly ReviewReasonCode[];
}

export function flattenReviewQueue(data: ReviewQueueData): readonly ReviewQueueRow[] {
  if (!data.available) {
    return [];
  }
  const rows: ReviewQueueRow[] = [];
  for (const locale of data.locales) {
    for (const entry of locale.needsReview) {
      rows.push({ locale: locale.locale, key: entry.key, reasons: entry.reasons });
    }
  }
  return rows;
}

export function visibleReviewQueueRows(
  data: ReviewQueueData,
  overlay: ReviewOverlayStore,
): readonly ReviewQueueRow[] {
  return flattenReviewQueue(data).filter((row) => !overlay.isActioned(row));
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
  row: ReviewOverlayEntry,
): string | undefined {
  return values.get(reviewValuesKey(row.locale, row.key))?.target;
}
