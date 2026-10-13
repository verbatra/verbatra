import type { NextFetchEvent } from "next/server";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/csp-script-hashes", () => ({
  loadBuiltScriptHashes: () => ({ "/en": [], "/de": [], "/en/docs": [], "/_not-found": [] }),
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
};

const fetchMock = vi.fn(async () => new Response("{}"));

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
  it.each(["/", "/de", "/docs"])(
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
    ["a Do Not Track visitor", { ...DOCUMENT_NAVIGATION, dnt: "1" }],
    ["a local run", { ...DOCUMENT_NAVIGATION, host: "localhost:3480" }],
    ["curl", { ...DOCUMENT_NAVIGATION, "user-agent": "curl/8.7.1" }],
  ])("never calls waitUntil for %s", async (_case, headers) => {
    expect(await visit("/", headers)).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never calls waitUntil for a redirect, a markdown page or a route that is not a page", async () => {
    expect(await visit("/en/docs")).not.toHaveBeenCalled();
    expect(await visit("/docs.md")).not.toHaveBeenCalled();
    expect(await visit("/does-not-exist")).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
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
