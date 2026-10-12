// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let live: typeof import("@/lib/live-stats");
let island: typeof import("@/components/landing/live-stat-value");

beforeEach(async () => {
  vi.resetModules();
  live = await import("@/lib/live-stats");
  island = await import("@/components/landing/live-stat-value");
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

function stubFetch(answer: () => Promise<Response>) {
  const fetcher = vi.fn((_input: string | URL | Request, _init?: RequestInit) => answer());
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}

async function renderValues(initial: string): Promise<HTMLElement> {
  const container = document.createElement("div");
  document.body.append(container);
  const { LiveStatValue } = island;
  await act(async () => {
    createRoot(container).render(
      <>
        <LiveStatValue stat="stars" initial={initial} locale="en" />
        <LiveStatValue stat="downloads" initial={initial} locale="en" />
      </>,
    );
  });
  await act(async () => {
    await live.loadLiveStats();
  });
  return container;
}

function values(container: HTMLElement): (string | null)[] {
  return Array.from(container.querySelectorAll("[data-live-stat]"), (node) => node.textContent);
}

describe("LiveStatValue", () => {
  it("swaps the build-time number for the live one, fetched once for every island", async () => {
    const fetcher = stubFetch(async () => Response.json({ stars: 2500, downloads: 15_600 }));

    const container = await renderValues("1.2K");

    expect(values(container)).toEqual(["2.5K", "15.6K"]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]?.[0]).toBe(live.LIVE_STATS_URL);
  });

  it("reserves the build-time number's width, so a new number moves nothing", async () => {
    stubFetch(async () => Response.json({ stars: 5, downloads: 5 }));

    const container = await renderValues("1.2K");

    const node = container.querySelector<HTMLElement>("[data-live-stat]");
    expect(node?.textContent).toBe("5");
    expect(node?.style.minInlineSize).toBe("4ch");
  });

  it.each([
    ["a failed request", async () => Promise.reject(new Error("offline"))],
    ["an error status", async () => new Response("down", { status: 503 })],
    ["a body that is not JSON", async () => new Response("<html>", { status: 200 })],
    ["null counts", async () => Response.json({ stars: null, downloads: null })],
    ["malformed counts", async () => Response.json({ stars: "12", downloads: -1 })],
    ["a null body", async () => Response.json(null)],
  ])("keeps the build-time number on %s", async (_label, answer) => {
    stubFetch(answer);

    const container = await renderValues("1.2K");

    expect(values(container)).toEqual(["1.2K", "1.2K"]);
  });
});

describe("loadLiveStats", () => {
  it("does not keep a failed request, so a later mount asks again", async () => {
    let fail = true;
    const fetcher = stubFetch(async () =>
      fail ? new Response("down", { status: 503 }) : Response.json({ stars: 2500, downloads: 1 }),
    );

    const first = await renderValues("1.2K");
    expect(values(first)).toEqual(["1.2K", "1.2K"]);

    fail = false;
    const second = await renderValues("1.2K");
    expect(values(second)).toEqual(["2.5K", "1"]);
    expect(fetcher.mock.calls.length).toBeGreaterThan(1);
  });

  it("keeps a successful answer for every later caller", async () => {
    const fetcher = stubFetch(async () => Response.json({ stars: 1, downloads: 2 }));
    await live.loadLiveStats();
    await live.loadLiveStats();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

describe("the header star count", () => {
  it("updates the visible count and the link's name together", async () => {
    stubFetch(async () => Response.json({ stars: 2500, downloads: 1 }));
    const { HomeNavProvider, GitHubNavLink } = await import("@/components/home-nav");
    const container = document.createElement("div");
    await act(async () => {
      createRoot(container).render(
        <HomeNavProvider
          value={{
            docsUrl: "/docs",
            quickstartUrl: "/docs/quickstart",
            locale: "en",
            stars: "1.2K",
            labels: {
              label: "Main",
              docs: "Docs",
              github: "GitHub",
              starsAria: "{count} stars on GitHub",
              changelog: "Changelog",
              getStarted: "Get started",
              menuOpen: "Open menu",
              menuClose: "Close menu",
              menuTitle: "Menu",
            },
          }}
        >
          <GitHubNavLink className="" location="header" />
        </HomeNavProvider>,
      );
    });
    await act(async () => {
      await live.loadLiveStats();
    });

    const link = container.querySelector("a");
    expect(link?.querySelector("[data-stars]")?.textContent).toBe("2.5K");
    expect(link?.getAttribute("aria-label")).toBe("2.5K stars on GitHub");
  });
});

describe("useLiveCount", () => {
  it("never shows a number the build-time render hid", async () => {
    stubFetch(async () => Response.json({ stars: 2500, downloads: 1 }));
    const seen: (string | null)[] = [];
    function Probe() {
      seen.push(live.useLiveCount("stars", null, "en"));
      return null;
    }
    const container = document.createElement("div");
    await act(async () => {
      createRoot(container).render(<Probe />);
    });
    await act(async () => {
      await live.loadLiveStats();
    });

    expect(seen.every((value) => value === null)).toBe(true);
  });
});

describe("reservedWidth", () => {
  it("reserves nothing without a build-time number", () => {
    expect(live.reservedWidth(null)).toBeUndefined();
  });
});
