import { useEffect, useRef } from "react";
import { createFocusRefresher } from "../client/run-history-refresh.js";

export function useRunHistoryRefreshOnFocus(onRefresh: () => void): void {
  const latest = useRef(onRefresh);

  useEffect(() => {
    latest.current = onRefresh;
  });

  useEffect(() => {
    const refresh = createFocusRefresher(() => latest.current(), {
      isVisible: () => document.visibilityState === "visible",
      now: () => Date.now(),
    });
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
}
