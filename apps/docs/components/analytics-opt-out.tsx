"use client";

import { type ReactNode, useEffect, useId, useState } from "react";
import Button from "@/components/ui/button";
import { type AnalyticsPreference, readAnalyticsPreference, setAnalyticsOptOut } from "@/lib/umami";

export interface AnalyticsOptOutLabels {
  readonly optOut: string;
  readonly optIn: string;
  readonly statusPending: string;
  readonly statusCounted: string;
  readonly statusOptedOut: string;
  readonly statusDoNotTrack: string;
  readonly statusUnavailable: string;
}

type OptOutState = AnalyticsPreference | "pending";

function statusLabel(state: OptOutState, labels: AnalyticsOptOutLabels): string {
  switch (state) {
    case "pending":
      return labels.statusPending;
    case "counted":
      return labels.statusCounted;
    case "opted-out":
      return labels.statusOptedOut;
    case "do-not-track":
      return labels.statusDoNotTrack;
    case "unavailable":
      return labels.statusUnavailable;
  }
}

export function AnalyticsOptOut({ labels }: { labels: AnalyticsOptOutLabels }): ReactNode {
  const [state, setState] = useState<OptOutState>("pending");
  const [announcement, setAnnouncement] = useState("");
  const statusId = useId();

  useEffect(() => {
    setState(readAnalyticsPreference());
  }, []);

  const optedOut = state === "opted-out";
  const toggle = () => {
    const next = setAnalyticsOptOut(!optedOut);
    setState(next);
    setAnnouncement(statusLabel(next, labels));
  };

  return (
    <div className="not-prose mt-4 flex flex-col items-start gap-3 rounded-xl border border-fd-border bg-[color:var(--surface-card)] p-4 sm:flex-row sm:items-center sm:justify-between">
      <p id={statusId} className="m-0 text-sm text-[color:var(--text-body)]">
        {statusLabel(state, labels)}
      </p>
      <Button
        variant="secondary"
        size="sm"
        aria-describedby={statusId}
        disabled={state === "pending" || state === "unavailable"}
        onClick={toggle}
      >
        {optedOut ? labels.optIn : labels.optOut}
      </Button>
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
