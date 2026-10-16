import { describe, expect, it, vi } from "vitest";
import {
  fetchGitHubStars,
  fetchProjectStats,
  GITHUB_REPO_API_URL,
  loadProjectStats,
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
};

describe("fetchProjectStats", () => {
  it("returns the star count and asks nothing else", async () => {
    const fetcher = fetcherFor(ok);

    await expect(fetchProjectStats({ fetcher, env: {} })).resolves.toEqual({ stars: 1234 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("caches at build time by default, so a prerendered page never regenerates", async () => {
    const fetcher = fetcherFor(ok);
    await fetchProjectStats({ fetcher, env: {} });

    expect(fetcher).toHaveBeenCalledTimes(1);
    for (const [, init] of fetcher.mock.calls) {
      expect(init?.cache).toBe("force-cache");
      expect(init?.next).toBeUndefined();
      expect(init?.signal).toBeInstanceOf(AbortSignal);
    }
  });

  it("revalidates hourly only when the caller asks for it", async () => {
    const fetcher = fetcherFor(ok);
    await fetchProjectStats({ fetcher, env: {}, caching: "hourly" });

    for (const [, init] of fetcher.mock.calls) {
      expect(init?.next?.revalidate).toBe(STATS_REVALIDATE_SECONDS);
      expect(init?.cache).toBeUndefined();
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
    });

    await expect(fetchProjectStats({ fetcher, env: {} })).resolves.toEqual({ stars: null });
  });

  it("hides a stat whose request times out", async () => {
    const fetcher = vi.fn(
      (_input: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
        }),
    );

    await expect(fetchGitHubStars({ fetcher, timeoutMs: 5, env: {} })).resolves.toBeNull();
  });

  it("hides a stat whose body is not JSON", async () => {
    const fetcher = fetcherFor({
      [GITHUB_REPO_API_URL]: () => new Response("<html>oops</html>", { status: 200 }),
    });

    await expect(fetchGitHubStars({ fetcher, env: {} })).resolves.toBeNull();
  });

  it.each([
    ["a missing field", { name: "verbatra" }],
    ["a string count", { stargazers_count: "12" }],
    ["a negative count", { stargazers_count: -1 }],
    ["a fractional count", { stargazers_count: 1.5 }],
    ["a null body", null],
  ])("hides the star count on %s", async (_label, github) => {
    const fetcher = fetcherFor({
      [GITHUB_REPO_API_URL]: () => jsonResponse(github),
    });

    await expect(fetchProjectStats({ fetcher, env: {} })).resolves.toEqual({ stars: null });
  });

  it("uses the global fetch when no fetcher is passed", async () => {
    const fetcher = fetcherFor(ok);
    vi.stubGlobal("fetch", fetcher);
    const stats = await fetchProjectStats({ env: {} });
    vi.unstubAllGlobals();

    expect(stats).toEqual({ stars: 1234 });
  });
});

describe("loadProjectStats", () => {
  it("reads the stats with build-time caching", async () => {
    const fetcher = fetcherFor(ok);
    vi.stubGlobal("fetch", fetcher);
    const stats = await loadProjectStats();
    vi.unstubAllGlobals();

    expect(stats).toEqual({ stars: 1234 });
    for (const [, init] of fetcher.mock.calls) expect(init?.cache).toBe("force-cache");
  });

  it("keeps a small figure as it is, with no display threshold", async () => {
    vi.stubGlobal(
      "fetch",
      fetcherFor({
        [GITHUB_REPO_API_URL]: () => jsonResponse({ stargazers_count: 2 }),
      }),
    );
    const stats = await loadProjectStats();
    vi.unstubAllGlobals();

    expect(stats).toEqual({ stars: 2 });
  });
});

describe("the server-only guard", () => {
  it("imports server-only first, so a client component that reaches the fetcher fails the build", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync(new URL("./project-stats.ts", import.meta.url), "utf8");
    expect(source.startsWith('import "server-only";\n')).toBe(true);
  });
});
