import { type CSSProperties, useEffect, useState } from "react";
import { formatCompactNumber } from "@/lib/compact-number";
import { afterFirstContentfulPaint } from "@/lib/first-paint";

export const LIVE_STATS_URL = "/api/stats";

type LiveStats = {
  readonly stars: number | null;
  readonly downloads: number | null;
};

export type LiveStat = keyof LiveStats;

let pending: Promise<LiveStats | null> | undefined;

function countOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

async function requestLiveStats(fetcher: typeof fetch): Promise<LiveStats | null> {
  try {
    const response = await fetcher(LIVE_STATS_URL, { headers: { Accept: "application/json" } });
    if (!response.ok) return null;
    const body: unknown = await response.json();
    if (typeof body !== "object" || body === null) return null;
    const record = body as Record<string, unknown>;
    return { stars: countOrNull(record.stars), downloads: countOrNull(record.downloads) };
  } catch {
    return null;
  }
}

export function loadLiveStats(fetcher: typeof fetch = fetch): Promise<LiveStats | null> {
  if (pending) return pending;
  const request: Promise<LiveStats | null> = requestLiveStats(fetcher).then((stats) => {
    if (stats === null && pending === request) pending = undefined;
    return stats;
  });
  pending = request;
  return request;
}

export function useLiveStats(): LiveStats | null {
  const [stats, setStats] = useState<LiveStats | null>(null);
  useEffect(() => {
    let active = true;
    void afterFirstContentfulPaint()
      .then(() => loadLiveStats())
      .then((loaded) => {
        if (active) setStats(loaded);
      });
    return () => {
      active = false;
    };
  }, []);
  return stats;
}

export function useLiveCount(
  stat: LiveStat,
  initial: string | null,
  locale: string,
): string | null {
  const live = useLiveStats()?.[stat] ?? null;
  if (initial === null || live === null) return initial;
  return formatCompactNumber(live, locale);
}

export function reservedWidth(initial: string | null): CSSProperties | undefined {
  return initial === null ? undefined : { minInlineSize: `${initial.length}ch` };
}
