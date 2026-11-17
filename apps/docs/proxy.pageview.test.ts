import type { NextFetchEvent } from "next/server";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/csp-script-hashes", () => ({
  loadBuiltScriptHashes: () => ({
    "/en": [],
    "/de": [],
    "/en/docs": [],
    "/en/privacy": [],
    "/de/privacy": [],
    "/_not-found": [],
  }),
  scriptHashesFor: () => [],
}));

const { default: proxy } = await import("./proxy");

const SAFARI =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";

const DOCUMENT_NAVIGATION: Record<string, string> = {
  host: "verbatra.kreitz-webdev.de",
  "sec-fetch-dest": "document",
  "sec-fetch-mode": "navigate",
  "user-agent": SAFARI,
  "x-forwarded-for": "84.132.10.7",
};

const fetchMock = vi.fn(async (..._args: unknown[]) => new Response("{}"));

function eventSpy() {
  const waitUntil = vi.fn();
  return { event: { waitUntil } as unknown as NextFetchEvent, waitUntil };
}

async function visit(path: string, headers: Record<string, string> = DOCUMENT_NAVIGATION) {
  const { event, waitUntil } = eventSpy();
  await proxy(new NextRequest(`https://verbatra.kreitz-webdev.de${path}`, { headers }), event);
  return waitUntil;
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockClear();
});

describe("proxy: server-side pageview", () => {
  it.each(["/", "/de", "/docs", "/privacy", "/de/privacy"])(
    "hands exactly one pageview for a document navigation to %s to waitUntil",
    async (path) => {
      const waitUntil = await visit(path);
      expect(waitUntil).toHaveBeenCalledTimes(1);
      await waitUntil.mock.calls[0]?.[0];
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    [
      "an RSC request",
      { ...DOCUMENT_NAVIGATION, "sec-fetch-dest": "empty", "sec-fetch-mode": "cors" },
    ],
    ["a prefetch", { ...DOCUMENT_NAVIGATION, "sec-purpose": "prefetch" }],
    ["a visitor who chose off", { ...DOCUMENT_NAVIGATION, cookie: "verbatra_analytics=off" }],
    [
      "a visitor with the legacy opt-out",
      { ...DOCUMENT_NAVIGATION, cookie: "verbatra_analytics_optout=1" },
    ],
    ["a Do Not Track visitor", { ...DOCUMENT_NAVIGATION, dnt: "1" }],
    ["a local run", { ...DOCUMENT_NAVIGATION, host: "localhost:3480" }],
    [
      "a local Host with a spoofed X-Forwarded-Host",
      {
        ...DOCUMENT_NAVIGATION,
        host: "localhost:3480",
        "x-forwarded-host": "localhost, verbatra.kreitz-webdev.de",
      },
    ],
    ["curl", { ...DOCUMENT_NAVIGATION, "user-agent": "curl/8.7.1" }],
  ])("never calls waitUntil for %s", async (_case, headers) => {
    expect(await visit("/", headers)).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  async function pageviewsSentFor(path: string, headers?: Record<string, string>) {
    const waitUntil = await visit(path, headers);
    await Promise.all(waitUntil.mock.calls.map(([task]) => task));
    return fetchMock.mock.calls
      .map(([, init]) => JSON.parse(String((init as unknown as RequestInit).body)))
      .filter((body) => body.payload.name === undefined);
  }

  it("never counts a pageview for a redirect, a markdown page or a route that is not a page", async () => {
    expect(await visit("/en/docs")).not.toHaveBeenCalled();
    expect(await pageviewsSentFor("/docs.md")).toEqual([]);
    expect(await pageviewsSentFor("/does-not-exist")).toEqual([]);
  });

  it("never counts a pageview for the privacy page served as markdown", async () => {
    expect(await pageviewsSentFor("/privacy.md")).toEqual([]);
    expect(
      await pageviewsSentFor("/privacy", { ...DOCUMENT_NAVIGATION, accept: "text/markdown" }),
    ).toEqual([]);
  });

  it("never calls waitUntil for a server action probe", async () => {
    expect(await visit("/", { ...DOCUMENT_NAVIGATION, "next-action": "x" })).not.toHaveBeenCalled();
  });

  it("sets no cookie on a counted page response", async () => {
    const { event } = eventSpy();
    const response = (await proxy(
      new NextRequest("https://verbatra.kreitz-webdev.de/", { headers: DOCUMENT_NAVIGATION }),
      event,
    )) as Response;
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});

describe("proxy: server-emitted events", () => {
  async function sentBodies(path: string, headers?: Record<string, string>) {
    const waitUntil = await visit(path, headers);
    await Promise.all(waitUntil.mock.calls.map(([task]) => task));
    return fetchMock.mock.calls.map(([, init]) =>
      JSON.parse(String((init as unknown as RequestInit).body)),
    );
  }

  it("emits not_found with the docs area for an unknown docs page", async () => {
    const bodies = await sentBodies("/docs/nope");
    expect(bodies).toHaveLength(1);
    expect(bodies[0].payload).toMatchObject({
      url: "/docs",
      name: "not_found",
      data: { area: "docs" },
    });
  });

  it("emits not_found with the other area for an unknown page", async () => {
    const bodies = await sentBodies("/nope");
    expect(bodies[0].payload).toMatchObject({ name: "not_found", data: { area: "other" } });
  });

  it("emits only the pageview, with no name, for a known page", async () => {
    const bodies = await sentBodies("/docs");
    expect(bodies).toHaveLength(1);
    expect(bodies[0].payload).not.toHaveProperty("name");
  });

  it("emits markdown_view and no pageview for a .md request", async () => {
    const bodies = await sentBodies("/privacy.md", {
      "user-agent": SAFARI,
      host: DOCUMENT_NAVIGATION.host as string,
      "x-forwarded-for": "84.132.10.7",
    });
    expect(bodies).toHaveLength(1);
    expect(bodies[0].payload).toMatchObject({ name: "markdown_view", data: { via: "suffix" } });
  });

  it("emits markdown_view via accept for a negotiated page", async () => {
    const bodies = await sentBodies("/privacy", {
      "user-agent": SAFARI,
      host: DOCUMENT_NAVIGATION.host as string,
      "x-forwarded-for": "84.132.10.7",
      accept: "text/markdown",
    });
    expect(bodies[0].payload).toMatchObject({ name: "markdown_view", data: { via: "accept" } });
  });

  it.each([
    ["Global Privacy Control", { ...DOCUMENT_NAVIGATION, "sec-gpc": "1" }],
    ["Do Not Track", { ...DOCUMENT_NAVIGATION, dnt: "1" }],
    ["the off choice", { ...DOCUMENT_NAVIGATION, cookie: "verbatra_analytics=off" }],
    ["a local run", { ...DOCUMENT_NAVIGATION, host: "localhost:3480" }],
    ["curl", { ...DOCUMENT_NAVIGATION, "user-agent": "curl/8.7.1" }],
  ])("emits nothing for an unknown page from %s", async (_case, headers) => {
    expect(await sentBodies("/docs/nope", headers)).toEqual([]);
  });

  it("emits nothing for an RSC request to an unknown page", async () => {
    const headers = { ...DOCUMENT_NAVIGATION, "sec-fetch-dest": "empty", "sec-fetch-mode": "cors" };
    expect(await sentBodies("/docs/nope", headers)).toEqual([]);
  });
});
