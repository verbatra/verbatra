import { useEffect, useState } from "react";
import type { LocaleValuesData } from "../client/locale-values.js";
import { toLocaleValuesOutcome } from "../client/locale-values.js";
import type { RefreshableView } from "../client/state.js";
import { applyRefreshOutcome } from "../client/state.js";
import { rpcClient } from "./api.js";

export function useLocaleValues(refreshToken?: unknown): RefreshableView<LocaleValuesData> {
  const [view, setView] = useState<RefreshableView<LocaleValuesData>>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    void rpcClient.call("locale.values", {}).then((response) => {
      if (cancelled) {
        return;
      }
      const outcome = toLocaleValuesOutcome(response);
      setView((previous) => applyRefreshOutcome(previous, outcome));
    });
    return () => {
      cancelled = true;
    };
  }, [refreshToken]);

  return view;
}
