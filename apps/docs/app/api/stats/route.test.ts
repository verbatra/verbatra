import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  GITHUB_REPO_API_URL,
  NPM_WEEKLY_DOWNLOADS_URL,
  STATS_CACHE_CONTROL,
  STATS_REVALIDATE_SECONDS,
} from "@/lib/project-stats";

const route = await import("./route");

function stubFetch(routes: Record<string, () => Response>) {
  const fetcher = vi.fn(async (input: string | URL | Request, _init?: RequestInit) => {
    const answer = routes[String(input)];
    if (!answer) throw new Error(`unexpected url ${String(input)}`);
    return answer();
  });
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GET /api/stats", () => {
  it("answers with the star count and the weekly downloads", async () => {
    const fetcher = stubFetch({
      [GITHUB_REPO_API_URL]: () => Response.json({ stargazers_count: 321 }),
      [NPM_WEEKLY_DOWNLOADS_URL]: () => Response.json({ downloads: 654 }),
    });

    const response = await route.GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ stars: 321, downloads: 654 });
    expect(response.headers.get("cache-control")).toBe(STATS_CACHE_CONTROL);
    for (const [, init] of fetcher.mock.calls) {
      expect(init?.next?.revalidate).toBe(STATS_REVALIDATE_SECONDS);
    }
  });

  it("answers with nulls when the upstream services fail", async () => {
    stubFetch({
      [GITHUB_REPO_API_URL]: () => new Response("rate limited", { status: 403 }),
      [NPM_WEEKLY_DOWNLOADS_URL]: () => {
        throw new Error("offline");
      },
    });

    const response = await route.GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ stars: null, downloads: null });
  });

  it("hides a figure below its display threshold, exactly like a failed fetch", async () => {
    stubFetch({
      [GITHUB_REPO_API_URL]: () => Response.json({ stargazers_count: 99 }),
      [NPM_WEEKLY_DOWNLOADS_URL]: () => Response.json({ downloads: 500 }),
    });

    expect(await (await route.GET()).json()).toEqual({ stars: null, downloads: 500 });
  });

  it("is a static route that regenerates hourly", () => {
    expect(route.dynamic).toBe("force-static");
    expect(route.revalidate).toBe(STATS_REVALIDATE_SECONDS);
  });

  it("is served outside the proxy, so it carries no page CSP and needs no script hash", () => {
    const proxy = readFileSync(new URL("../../../proxy.ts", import.meta.url), "utf8");
    expect(proxy).toMatch(/\(\?!api\|/);
  });
});
