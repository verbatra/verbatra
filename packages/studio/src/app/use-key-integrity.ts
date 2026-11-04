import { useEffect, useState } from "react";
import { type KeyIntegrityLocaleEntry, withFullIntegrity } from "../client/integrity-pill.js";
import { rpcClient } from "./api.js";

export type KeyIntegrityState =
  | { readonly kind: "loading" }
  | { readonly kind: "error"; readonly message: string }
  | { readonly kind: "loaded"; readonly locales: readonly KeyIntegrityLocaleEntry[] };

interface KeyedIntegrity {
  readonly key: string;
  readonly state: KeyIntegrityState;
}

const LOADING: KeyIntegrityState = { kind: "loading" };

export function useKeyIntegrity(key: string, refreshToken: number): KeyIntegrityState {
  const [held, setHeld] = useState<KeyedIntegrity>({ key, state: LOADING });

  useEffect(() => {
    let cancelled = false;
    const setState = (state: KeyIntegrityState): void => setHeld({ key, state });
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

  return held.key === key ? held.state : LOADING;
}
