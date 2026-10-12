import { describe, expect, it, vi } from "vitest";
import {
  fetchGitHubStars,
  fetchProjectStats,
  fetchWeeklyDownloads,
  formatCompactNumber,
  GITHUB_REPO_API_URL,
  NPM_WEEKLY_DOWNLOADS_URL,
  STATS_REVALIDATE_SECONDS,
} from "@/lib/project-stats";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function fetcherFor(routes: Record<string, () => Response>) {
  return vi.fn(async (input: string | URL | Request, _init?: RequestInit) => {
    const route = routes[String(input)];
    if (!route) throw new Error(`unexpected url ${String(input)}`);
    return route();
  });
}

const ok = {
  [GITHUB_REPO_API_URL]: () => jsonResponse({ stargazers_count: 1234, name: "verbatra" }),
  [NPM_WEEKLY_DOWNLOADS_URL]: () =>
    jsonResponse({ downloads: 5678, package: "@verbatra/cli", start: "a", end: "b" }),
};

describe("fetchProjectStats", () => {
  it("returns the star count and the weekly downloads", async () => {
    const fetcher = fetcherFor(ok);

    await expect(fetchProjectStats({ fetcher, env: {} })).resolves.toEqual({
      stars: 1234,
      weeklyDownloads: 5678,
    });
  });

  it("revalidates hourly and sets a timeout signal on every request", async () => {
    const fetcher = fetcherFor(ok);
    await fetchProjectStats({ fetcher, env: {} });

    expect(fetcher).toHaveBeenCalledTimes(2);
    for (const [, init] of fetcher.mock.calls) {
      expect(init?.next?.revalidate).toBe(STATS_REVALIDATE_SECONDS);
      expect(init?.signal).toBeInstanceOf(AbortSignal);
    }
  });

  it("sends a GitHub token only when one is set", async () => {
    const withToken = fetcherFor(ok);
    await fetchGitHubStars({ fetcher: withToken, env: { GITHUB_TOKEN: "t0ken" } });
    const without = fetcherFor(ok);
    await fetchGitHubStars({ fetcher: without, env: { GITHUB_TOKEN: "" } });

    const headersOf = (mock: typeof withToken) =>
      new Headers(mock.mock.calls[0]?.[1]?.headers).get("authorization");
    expect(headersOf(withToken)).toBe("Bearer t0ken");
    expect(headersOf(without)).toBeNull();
  });

  it("reads the token from process.env by default", async () => {
    vi.stubEnv("GITHUB_TOKEN", "from-env");
    const fetcher = fetcherFor(ok);
    await fetchGitHubStars({ fetcher });
    vi.unstubAllEnvs();

    expect(new Headers(fetcher.mock.calls[0]?.[1]?.headers).get("authorization")).toBe(
      "Bearer from-env",
    );
  });

  it("hides a stat whose endpoint answers with a non-200 status", async () => {
    const fetcher = fetcherFor({
      [GITHUB_REPO_API_URL]: () => jsonResponse({ message: "rate limited" }, 403),
      [NPM_WEEKLY_DOWNLOADS_URL]: ok[NPM_WEEKLY_DOWNLOADS_URL],
    });

    await expect(fetchProjectStats({ fetcher, env: {} })).resolves.toEqual({
      stars: null,
      weeklyDownloads: 5678,
    });
  });

  it("hides a stat whose request times out", async () => {
    const fetcher = vi.fn(
      (_input: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
        }),
    );

    await expect(fetchWeeklyDownloads({ fetcher, timeoutMs: 5 })).resolves.toBeNull();
  });

  it("hides a stat whose body is not JSON", async () => {
    const fetcher = fetcherFor({
      [GITHUB_REPO_API_URL]: () => new Response("<html>oops</html>", { status: 200 }),
      [NPM_WEEKLY_DOWNLOADS_URL]: ok[NPM_WEEKLY_DOWNLOADS_URL],
    });

    await expect(fetchGitHubStars({ fetcher, env: {} })).resolves.toBeNull();
  });

  it.each([
    ["a missing field", { name: "verbatra" }, { error: "package not found" }],
    ["a string count", { stargazers_count: "12" }, { downloads: "34" }],
    ["a negative count", { stargazers_count: -1 }, { downloads: -1 }],
    ["a fractional count", { stargazers_count: 1.5 }, { downloads: 2.5 }],
    ["a null body", null, null],
  ])("hides both stats on %s", async (_label, github, npm) => {
    const fetcher = fetcherFor({
      [GITHUB_REPO_API_URL]: () => jsonResponse(github),
      [NPM_WEEKLY_DOWNLOADS_URL]: () => jsonResponse(npm),
    });

    await expect(fetchProjectStats({ fetcher, env: {} })).resolves.toEqual({
      stars: null,
      weeklyDownloads: null,
    });
  });

  it("uses the global fetch when no fetcher is passed", async () => {
    const fetcher = fetcherFor(ok);
    vi.stubGlobal("fetch", fetcher);
    const stats = await fetchProjectStats({ env: {} });
    vi.unstubAllGlobals();

    expect(stats).toEqual({ stars: 1234, weeklyDownloads: 5678 });
  });
});

describe("formatCompactNumber", () => {
  it.each([
    ["en", 950, /^950$/],
    ["en", 1234, /^1\.2K$/],
    ["en", 15600, /^15\.6K$/],
    ["en", 2_300_000, /^2\.3M$/],
    ["de", 15600, /^15\.600$/],
    ["fr", 1234, /^1,2\sk$/u],
    ["es", 1234, /^1,2\smil$/u],
  ])("formats %s %d in that locale's compact notation", (locale, value, expected) => {
    expect(formatCompactNumber(value, locale)).toMatch(expected);
  });
});

describe("the server-only guard", () => {
  it("imports server-only first, so a client component that reaches the fetcher fails the build", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync(new URL("./project-stats.ts", import.meta.url), "utf8");
    expect(source.startsWith('import "server-only";\n')).toBe(true);
  });
});
