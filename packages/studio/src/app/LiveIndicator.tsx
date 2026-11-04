import { Badge } from "@verbatra/ui";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { connectionStore } from "./api.js";

const DEGRADED_BADGE_DELAY_MS = 1500;

export function LiveIndicator(): ReactNode {
  const [status, setStatus] = useState(connectionStore.getStatus());
  const [showDegraded, setShowDegraded] = useState(false);

  useEffect(() => {
    const unsubscribe = connectionStore.subscribe(setStatus);
    setStatus(connectionStore.getStatus());
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (status === "live") {
      setShowDegraded(false);
      return;
    }
    const timer = window.setTimeout(() => setShowDegraded(true), DEGRADED_BADGE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [status]);

  return (
    <span role="status" className="inline-flex items-center">
      {showDegraded ? (
        <Badge tone="warning">Reconnecting</Badge>
      ) : status === "live" ? (
        <span
          className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs text-(--status-success)"
          data-live=""
        >
          <span aria-hidden="true" className="size-1.5 rounded-full bg-(--status-success)" />
          Live
        </span>
      ) : null}
    </span>
  );
}
