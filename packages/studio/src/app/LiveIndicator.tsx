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
    <span role="status">{showDegraded ? <Badge tone="warning">Reconnecting</Badge> : null}</span>
  );
}
