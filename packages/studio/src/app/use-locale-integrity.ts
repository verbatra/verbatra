import { useEffect, useState } from "react";
import type { LocaleIntegrityData } from "../client/key-status-filter.js";
import type { RefreshableView } from "../client/state.js";
import { applyRefreshOutcome } from "../client/state.js";
import { rpcClient } from "./api.js";

export function useLocaleIntegrity(refreshToken?: unknown): RefreshableView<LocaleIntegrityData> {
  const [view, setView] = useState<RefreshableView<LocaleIntegrityData>>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    void rpcClient.call("locale.integrity", {}).then((response) => {
      if (cancelled) {
        return;
      }
      setView((previous) =>
        applyRefreshOutcome(
          previous,
          response.ok
            ? { ok: true, result: response.result.locales }
            : { ok: false, error: response.error },
        ),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [refreshToken]);

  return view;
}
