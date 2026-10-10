import { useEffect, useState } from "react";
import type { StructuredError } from "../client/state.js";
import type { HistoryCommit, HistoryUnavailableReason } from "../shared/rpc/history.js";
import { rpcClient } from "./api.js";

export type HistoryState =
  | { readonly kind: "loading" }
  | { readonly kind: "error"; readonly error: StructuredError }
  | { readonly kind: "unavailable"; readonly reason: HistoryUnavailableReason }
  | { readonly kind: "loaded"; readonly commits: readonly HistoryCommit[] };

export function useHistoryList(refreshToken?: unknown): HistoryState {
  const [state, setState] = useState<HistoryState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    void rpcClient.call("history.list", {}).then((response) => {
      if (cancelled) {
        return;
      }
      if (!response.ok) {
        setState({ kind: "error", error: response.error });
        return;
      }
      if (!response.result.available) {
        setState({ kind: "unavailable", reason: response.result.reason });
        return;
      }
      setState({ kind: "loaded", commits: response.result.commits });
    });
    return () => {
      cancelled = true;
    };
  }, [refreshToken]);

  return state;
}
