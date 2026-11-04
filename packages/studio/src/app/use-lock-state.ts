import { useEffect, useState } from "react";
import type { RpcCallResult } from "../client/rpc-client.js";
import type { StructuredError } from "../client/state.js";
import { rpcClient } from "./api.js";

type LockStateResponse = RpcCallResult<"lock.state">;

export type LockLocaleState = Extract<
  Extract<LockStateResponse, { ok: true }>["result"],
  { exists: true }
>["locales"][number];

export type LockView =
  | { readonly kind: "loading" }
  | { readonly kind: "error"; readonly error: StructuredError }
  | { readonly kind: "no-lock" }
  | {
      readonly kind: "loaded";
      readonly version: number;
      readonly locales: readonly LockLocaleState[];
    };

export function useLockState(refreshToken: number): LockView {
  const [view, setView] = useState<LockView>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    void rpcClient.call("lock.state", {}).then((response) => {
      if (cancelled) {
        return;
      }
      if (!response.ok) {
        setView({ kind: "error", error: response.error });
        return;
      }
      if (!response.result.exists) {
        setView({ kind: "no-lock" });
        return;
      }
      setView({
        kind: "loaded",
        version: response.result.version,
        locales: response.result.locales,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [refreshToken]);

  return view;
}
