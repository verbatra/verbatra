"use client";

import type { ReactNode } from "react";
import { formatCompactNumber } from "@/lib/compact-number";
import { type LiveStat, useLiveCount, useLiveStats, widestLiveCount } from "@/lib/live-stats";
import { reservedWidth } from "@/lib/reserved-width";

function StatFigure({
  stat,
  value,
  label,
  reserve = null,
}: {
  stat: LiveStat;
  value: string | null;
  label: string;
  reserve?: string | null;
}): ReactNode {
  return (
    <>
      <span className="vk-proof-strip-value" data-live-stat={stat} style={reservedWidth(reserve)}>
        {value}
      </span>{" "}
      <span className="vk-proof-strip-label">{label}</span>
    </>
  );
}

export function LiveStatValue({
  stat,
  initial,
  label,
  locale,
}: {
  stat: LiveStat;
  initial: string;
  label: string;
  locale: string;
}): ReactNode {
  return (
    <StatFigure
      stat={stat}
      value={useLiveCount(stat, initial, locale)}
      label={label}
      reserve={initial}
    />
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
  return (
    <span className="vk-proof-strip-stack">
      <span className="vk-proof-strip-value" data-fallback data-shown={live === null}>
        {fallback}
      </span>
      <span data-shown={live !== null}>
        <StatFigure
          stat={stat}
          value={live === null ? null : formatCompactNumber(live, locale)}
          label={label}
          reserve={widestLiveCount(locale)}
        />
      </span>
    </span>
  );
}
