import { useEffect, useState } from "react";
import type { DiffLocale } from "../client/diff-view.js";
import type { StructuredError } from "../client/state.js";
import { rpcClient } from "./api.js";

export type DiffState =
  | { readonly kind: "loading" }
  | { readonly kind: "error"; readonly error: StructuredError }
  | {
      readonly kind: "loaded";
      readonly hasPendingChanges: boolean;
      readonly locales: readonly DiffLocale[];
      readonly staleError?: StructuredError;
    };

export function useDiffState(refreshToken: number): DiffState {
  const [diff, setDiff] = useState<DiffState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    void rpcClient.call("status.diff", {}).then((response) => {
      if (cancelled) {
        return;
      }
      if (!response.ok) {
        setDiff((previous) =>
          previous.kind === "loaded"
            ? { ...previous, staleError: response.error }
            : { kind: "error", error: response.error },
        );
        return;
      }
      setDiff({
        kind: "loaded",
        hasPendingChanges: response.result.hasPendingChanges,
        locales: response.result.locales,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [refreshToken]);

  return diff;
}
