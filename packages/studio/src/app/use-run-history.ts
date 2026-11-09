import { useEffect, useState } from "react";
import type { RunHistoryData } from "../client/run-history-view.js";
import { RUN_HISTORY_REQUEST_LIMIT, toRunHistoryOutcome } from "../client/run-history-view.js";
import type { RefreshableView } from "../client/state.js";
import { applyRefreshOutcome } from "../client/state.js";
import { rpcClient } from "./api.js";

export function useRunHistory(refreshToken?: unknown): RefreshableView<RunHistoryData> {
  const [view, setView] = useState<RefreshableView<RunHistoryData>>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    void rpcClient.call("usage.history", { limit: RUN_HISTORY_REQUEST_LIMIT }).then((response) => {
      if (cancelled) {
        return;
      }
      const outcome = toRunHistoryOutcome(response);
      setView((previous) => applyRefreshOutcome(previous, outcome));
    });
    return () => {
      cancelled = true;
    };
  }, [refreshToken]);

  return view;
}
