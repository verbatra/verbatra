import { useEffect, useState } from "react";
import type { StructuredError } from "../client/state.js";
import type { HistoryCommit, HistoryUnavailableReason } from "../shared/rpc/history.js";
import { rpcClient } from "./api.js";

export type HistoryState =
  | { readonly kind: "loading" }
  | { readonly kind: "error"; readonly error: StructuredError }
  | { readonly kind: "unavailable"; readonly reason: HistoryUnavailableReason }
  | {
      readonly kind: "loaded";
      readonly commits: readonly HistoryCommit[];
      readonly requestedLimit?: number | undefined;
      readonly truncated?: true;
      readonly staleError?: StructuredError;
    };

export function useHistoryList(refreshToken?: unknown, limit?: number): HistoryState {
  const [state, setState] = useState<HistoryState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    void rpcClient.call("history.list", limit === undefined ? {} : { limit }).then((response) => {
      if (cancelled) {
        return;
      }
      if (!response.ok) {
        setState((previous) =>
          previous.kind === "loaded"
            ? { ...previous, staleError: response.error }
            : { kind: "error", error: response.error },
        );
        return;
      }
      if (!response.result.available) {
        setState({ kind: "unavailable", reason: response.result.reason });
        return;
      }
      setState({
        kind: "loaded",
        commits: response.result.commits,
        requestedLimit: limit,
        ...(response.result.truncated === true ? { truncated: true as const } : {}),
      });
    });
    return () => {
      cancelled = true;
    };
  }, [refreshToken, limit]);

  return state;
}
