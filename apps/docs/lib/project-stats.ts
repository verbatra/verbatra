import "server-only";
import { cache } from "react";
import { z } from "zod";

export const GITHUB_REPO_API_URL = "https://api.github.com/repos/verbatra/verbatra";

export const NPM_WEEKLY_DOWNLOADS_URL =
  "https://api.npmjs.org/downloads/point/last-week/@verbatra/cli";

export const STATS_REVALIDATE_SECONDS = 3600;

export const STATS_TIMEOUT_MS = 3000;

export const STATS_CACHE_CONTROL =
  "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400";

const githubRepoSchema = z.object({ stargazers_count: z.number().int().nonnegative() });

const npmDownloadsSchema = z.object({ downloads: z.number().int().nonnegative() });

export type ProjectStats = {
  readonly stars: number | null;
  readonly weeklyDownloads: number | null;
};

export const STAT_DISPLAY_THRESHOLDS = {
  stars: 100,
  weeklyDownloads: 500,
} as const satisfies Readonly<Record<keyof ProjectStats, number>>;

export type StatsCaching = "build" | "hourly";

export type ProjectStatsOptions = {
  readonly caching?: StatsCaching;
  readonly fetcher?: typeof fetch;
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly timeoutMs?: number;
};

export function statsCacheInit(caching: StatsCaching): RequestInit {
  return caching === "hourly"
    ? { next: { revalidate: STATS_REVALIDATE_SECONDS } }
    : { cache: "force-cache" };
}

function githubHeaders(token: string | undefined): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token !== undefined && token.length > 0) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function fetchJson(
  url: string,
  headers: Record<string, string>,
  options: ProjectStatsOptions,
): Promise<unknown> {
  const fetcher = options.fetcher ?? fetch;
  try {
    const response = await fetcher(url, {
      ...statsCacheInit(options.caching ?? "build"),
      headers,
      signal: AbortSignal.timeout(options.timeoutMs ?? STATS_TIMEOUT_MS),
    });
    if (!response.ok) return undefined;
    return await response.json();
  } catch {
    return undefined;
  }
}

export async function fetchGitHubStars(options: ProjectStatsOptions = {}): Promise<number | null> {
  const env = options.env ?? process.env;
  const body = await fetchJson(GITHUB_REPO_API_URL, githubHeaders(env.GITHUB_TOKEN), options);
  const parsed = githubRepoSchema.safeParse(body);
  return parsed.success ? parsed.data.stargazers_count : null;
}

export async function fetchWeeklyDownloads(
  options: ProjectStatsOptions = {},
): Promise<number | null> {
  const body = await fetchJson(NPM_WEEKLY_DOWNLOADS_URL, { Accept: "application/json" }, options);
  const parsed = npmDownloadsSchema.safeParse(body);
  return parsed.success ? parsed.data.downloads : null;
}

export async function fetchProjectStats(options: ProjectStatsOptions = {}): Promise<ProjectStats> {
  const [stars, weeklyDownloads] = await Promise.all([
    fetchGitHubStars(options),
    fetchWeeklyDownloads(options),
  ]);
  return { stars, weeklyDownloads };
}

function shownCount(value: number | null, threshold: number): number | null {
  return value !== null && value >= threshold ? value : null;
}

export function displayableStats(stats: ProjectStats): ProjectStats {
  return {
    stars: shownCount(stats.stars, STAT_DISPLAY_THRESHOLDS.stars),
    weeklyDownloads: shownCount(stats.weeklyDownloads, STAT_DISPLAY_THRESHOLDS.weeklyDownloads),
  };
}

export const loadProjectStats = cache(
  async (): Promise<ProjectStats> =>
    displayableStats(await fetchProjectStats({ caching: "build" })),
);
