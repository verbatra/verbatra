"use client";

import type { ReactNode } from "react";
import { formatCompactNumber } from "@/lib/compact-number";
import { type LiveStat, reservedWidth, useLiveCount, useLiveStats } from "@/lib/live-stats";

export function LiveStatValue({
  stat,
  initial,
  locale,
}: {
  stat: LiveStat;
  initial: string;
  locale: string;
}): ReactNode {
  const value = useLiveCount(stat, initial, locale);
  return (
    <span className="vk-proof-strip-value" data-live-stat={stat} style={reservedWidth(initial)}>
      {value}
    </span>
  );
}

export function LiveStatFallback({
  stat,
  fallback,
  label,
  locale,
}: {
  stat: LiveStat;
  fallback: string;
  label: string;
  locale: string;
}): ReactNode {
  const live = useLiveStats()?.[stat] ?? null;
  if (live === null) {
    return (
      <span className="vk-proof-strip-value" data-fallback>
        {fallback}
      </span>
    );
  }
  return (
    <>
      <span className="vk-proof-strip-value" data-live-stat={stat}>
        {formatCompactNumber(live, locale)}
      </span>{" "}
      <span className="vk-proof-strip-label">{label}</span>
    </>
  );
}
