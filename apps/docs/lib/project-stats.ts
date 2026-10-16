import "server-only";
import { cache } from "react";
import { z } from "zod";

export const GITHUB_REPO_API_URL = "https://api.github.com/repos/verbatra/verbatra";

export const STATS_REVALIDATE_SECONDS = 3600;

const STATS_TIMEOUT_MS = 3000;

export const STATS_CACHE_CONTROL =
  "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400";

const githubRepoSchema = z.object({ stargazers_count: z.number().int().nonnegative() });

export type ProjectStats = {
  readonly stars: number | null;
};

type StatsCaching = "build" | "hourly";

type ProjectStatsOptions = {
  readonly caching?: StatsCaching;
  readonly fetcher?: typeof fetch;
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly timeoutMs?: number;
};

function statsCacheInit(caching: StatsCaching): RequestInit {
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

export async function fetchProjectStats(options: ProjectStatsOptions = {}): Promise<ProjectStats> {
  return { stars: await fetchGitHubStars(options) };
}

export const loadProjectStats = cache(
  (): Promise<ProjectStats> => fetchProjectStats({ caching: "build" }),
);
