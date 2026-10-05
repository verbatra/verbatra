import { useEffect, useState } from "react";
import type { StudioCapabilities } from "../shared/rpc/snapshot.js";
import { rpcClient } from "./api.js";

export type CapabilitiesState =
  | { readonly kind: "loading" }
  | { readonly kind: "error" }
  | {
      readonly kind: "loaded";
      readonly capabilities: StudioCapabilities;
      readonly sourceLocale: string;
    };

export function useCapabilities(): CapabilitiesState {
  const [state, setState] = useState<CapabilitiesState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    void rpcClient.call("project.snapshot", {}).then((response) => {
      if (cancelled) {
        return;
      }
      if (!response.ok) {
        setState({ kind: "error" });
        return;
      }
      setState({
        kind: "loaded",
        capabilities: response.result.capabilities,
        sourceLocale: response.result.sourceLocale,
      });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
