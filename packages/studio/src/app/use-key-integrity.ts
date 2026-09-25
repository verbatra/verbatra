import { useEffect, useState } from "react";
import { type KeyIntegrityLocaleEntry, withFullIntegrity } from "../client/integrity-pill.js";
import { rpcClient } from "./api.js";

export type KeyIntegrityState =
  | { readonly kind: "loading" }
  | { readonly kind: "error"; readonly message: string }
  | { readonly kind: "loaded"; readonly locales: readonly KeyIntegrityLocaleEntry[] };

export function useKeyIntegrity(key: string, refreshToken: number): KeyIntegrityState {
  const [state, setState] = useState<KeyIntegrityState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    void Promise.all([
      rpcClient.call("key.integrity", { key }),
      rpcClient.call("locale.integrity", {}),
    ]).then(([changed, full]) => {
      if (cancelled) {
        return;
      }
      if (!changed.ok) {
        setState({ kind: "error", message: changed.error.message });
        return;
      }
      setState({
        kind: "loaded",
        locales: full.ok
          ? withFullIntegrity(changed.result.locales, full.result.locales, key)
          : changed.result.locales,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [key, refreshToken]);

  return state;
}
