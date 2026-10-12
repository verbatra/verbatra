"use client";

import type { ReactNode } from "react";
import { type LiveStat, reservedWidth, useLiveCount } from "@/lib/live-stats";

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
