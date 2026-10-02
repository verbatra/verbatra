import { useEffect, useState } from "react";
import type { ReviewQueueData } from "../client/review-queue-data.js";
import { toReviewQueueOutcome } from "../client/review-queue-data.js";
import type { RefreshableView } from "../client/state.js";
import { applyRefreshOutcome } from "../client/state.js";
import { rpcClient } from "./api.js";

export function useReviewQueue(
  refreshToken?: unknown,
  reloadToken?: unknown,
): RefreshableView<ReviewQueueData> {
  const [view, setView] = useState<RefreshableView<ReviewQueueData>>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    void rpcClient.call("review.queue", { includeApproved: true }).then((response) => {
      if (cancelled) {
        return;
      }
      const outcome = toReviewQueueOutcome(response);
      setView((previous) => applyRefreshOutcome(previous, outcome));
    });
    return () => {
      cancelled = true;
    };
  }, [refreshToken, reloadToken]);

  return view;
}
