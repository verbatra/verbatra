import { useEffect, useState } from "react";
import { rpcClient } from "./api.js";

export type ProjectFormatState =
  | { readonly kind: "loading" }
  | { readonly kind: "unknown" }
  | { readonly kind: "known"; readonly format: string };

export function useProjectFormat(): ProjectFormatState {
  const [state, setState] = useState<ProjectFormatState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    void rpcClient.call("project.snapshot", {}).then((response) => {
      if (!cancelled) {
        setState(
          response.ok ? { kind: "known", format: response.result.format } : { kind: "unknown" },
        );
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
