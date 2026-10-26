// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { reservedWidth } from "./reserved-width";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let live: typeof import("@/lib/live-stats");

beforeEach(async () => {
  vi.resetModules();
  live = await import("@/lib/live-stats");
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

function Count({ initial }: { initial: string }) {
  return <span data-live-stat="stars">{live.useLiveCount("stars", initial, "en")}</span>;
}

async function renderValues(initial: string): Promise<HTMLElement> {
  const container = document.createElement("div");
  document.body.append(container);
  await act(async () => {
    createRoot(container).render(
      <>
        <Count initial={initial} />
        <Count initial={initial} />
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

describe("useLiveCount with a build-time number", () => {
  it("swaps the build-time number for the live one, fetched once for every island", async () => {
    const fetcher = stubFetch(async () => Response.json({ stars: 2500 }));

    const container = await renderValues("1.2K");

    expect(values(container)).toEqual(["2.5K", "2.5K"]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]?.[0]).toBe(live.LIVE_STATS_URL);
  });

  it.each([
    ["a failed request", async () => Promise.reject(new Error("offline"))],
    ["an error status", async () => new Response("down", { status: 503 })],
    ["a body that is not JSON", async () => new Response("<html>", { status: 200 })],
    ["null counts", async () => Response.json({ stars: null })],
    ["malformed counts", async () => Response.json({ stars: "12" })],
    ["a null body", async () => Response.json(null)],
  ])("keeps the build-time number on %s", async (_label, answer) => {
    stubFetch(answer);

    const container = await renderValues("1.2K");

    expect(values(container)).toEqual(["1.2K", "1.2K"]);
  });
});

describe("useLiveStats", () => {
  it("asks for the live numbers only after the first contentful paint", async () => {
    let paint: () => void = () => undefined;
    const painted = new Promise<void>((resolve) => {
      paint = resolve;
    });
    vi.resetModules();
    vi.doMock("@/lib/first-paint", () => ({ afterFirstContentfulPaint: () => painted }));
    const fetcher = stubFetch(async () => Response.json({ stars: 2500 }));
    const fresh = await import("@/lib/live-stats");
    function Fresh() {
      return <span>{fresh.useLiveCount("stars", "1.2K", "en")}</span>;
    }
    const container = document.createElement("div");
    document.body.append(container);
    await act(async () => {
      createRoot(container).render(<Fresh />);
    });
    expect(fetcher).not.toHaveBeenCalled();
    await act(async () => {
      paint();
      await painted;
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(container.textContent).toBe("2.5K");
    vi.doUnmock("@/lib/first-paint");
  });
});

describe("loadLiveStats", () => {
  it("does not keep a failed request, so a later mount asks again", async () => {
    let fail = true;
    const fetcher = stubFetch(async () =>
      fail ? new Response("down", { status: 503 }) : Response.json({ stars: 2500 }),
    );

    const first = await renderValues("1.2K");
    expect(values(first)).toEqual(["1.2K", "1.2K"]);

    fail = false;
    const second = await renderValues("1.2K");
    expect(values(second)).toEqual(["2.5K", "2.5K"]);
    expect(fetcher.mock.calls.length).toBeGreaterThan(1);
  });

  it("keeps a successful answer for every later caller", async () => {
    const fetcher = stubFetch(async () => Response.json({ stars: 1 }));
    await live.loadLiveStats();
    await live.loadLiveStats();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

describe("the header star count", () => {
  it("updates the visible count and the link's name together", async () => {
    stubFetch(async () => Response.json({ stars: 2500 }));
    const { HomeNavProvider, GitHubNavLink } = await import("@/components/home-nav");
    const container = document.createElement("div");
    await act(async () => {
      createRoot(container).render(
        <HomeNavProvider
          value={{
            docsUrl: "/docs",
            quickstartUrl: "/docs/quickstart",
            featuresUrl: "/#features",
            locale: "en",
            stars: "1.2K",
            labels: {
              label: "Main",
              features: "Features",
              docs: "Docs",
              github: "GitHub",
              starsAria: "{count} stars on GitHub",
              changelog: "Changelog",
              getStarted: "Get started",
              menuOpen: "Open menu",
              menuClose: "Close menu",
              menuTitle: "Menu",
              newTab: "(opens in a new tab)",
            },
          }}
        >
          <GitHubNavLink className="" />
        </HomeNavProvider>,
      );
    });
    await act(async () => {
      await live.loadLiveStats();
    });

    const link = container.querySelector("a");
    expect(link?.querySelector("[data-stars]")?.textContent).toBe("2.5K");
    expect(link?.hasAttribute("aria-label")).toBe(false);
    expect(link?.querySelector(".sr-only")?.textContent).toBe(" stars on GitHub");
  });
});

describe("useLiveCount", () => {
  it("never shows a number the build-time render hid", async () => {
    stubFetch(async () => Response.json({ stars: 2500 }));
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
  it("reserves nothing without a build-time number, and one ch per character with one", () => {
    expect(reservedWidth(null)).toBeUndefined();
    expect(reservedWidth("1.2K")).toEqual({ minInlineSize: "4ch" });
  });
});
