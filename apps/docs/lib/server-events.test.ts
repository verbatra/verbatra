import { describe, expect, it } from "vitest";
import { proxyEventFor } from "./server-events";

const SAFARI =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const ROUTES = {
  "/en": [],
  "/de": [],
  "/en/docs": [],
  "/en/docs/quickstart": [],
  "/en/privacy": [],
  "/de/docs/quickstart": [],
  "/_not-found": [],
  "/_global-error": [],
};
const DOCUMENT: Record<string, string> = {
  "sec-fetch-dest": "document",
  "sec-fetch-mode": "navigate",
  "user-agent": SAFARI,
};

function get(path: string, headers: Record<string, string> = DOCUMENT, method = "GET"): Request {
  return new Request(`https://verbatra.kreitz-webdev.de${path}`, { method, headers });
}

const ok = () => new Response(null, { status: 200 });

function served(path: string): string {
  return path === "/" ? "/en" : path.startsWith("/de") ? path : `/en${path}`;
}

function eventFor(request: Request, response: Response = ok(), routes = ROUTES) {
  const { pathname } = new URL(request.url);
  return proxyEventFor(request, response, served(pathname), routes);
}

describe("not_found", () => {
  it.each([
    ["/docs/nope", "docs"],
    ["/de/docs/nope", "docs"],
    ["/nope", "other"],
    ["/de/whatever", "other"],
  ])("reports a document navigation to the unknown page %s with area %s", (path, area) => {
    expect(eventFor(get(path))).toEqual({
      url: path,
      name: "not_found",
      data: { area },
    });
  });

  it.each([
    ["a known page", "/docs"],
    ["the landing page", "/"],
  ])("reports nothing for %s", (_case, path) => {
    expect(eventFor(get(path))).toBeUndefined();
  });

  it.each([
    ["a prefetch", { ...DOCUMENT, "sec-purpose": "prefetch" }],
    ["an RSC fetch", { ...DOCUMENT, "sec-fetch-dest": "empty", "sec-fetch-mode": "cors" }],
    ["a subresource", { ...DOCUMENT, "sec-fetch-dest": "image" }],
  ])("reports nothing for %s to an unknown page", (_case, headers) => {
    expect(eventFor(get("/docs/nope", headers))).toBeUndefined();
  });

  it("reports nothing for a redirect", () => {
    const redirect = new Response(null, { status: 308, headers: { location: "/docs" } });
    expect(eventFor(get("/docs/nope"), redirect)).toBeUndefined();
  });

  it("reports nothing for a non-GET method", () => {
    expect(eventFor(get("/docs/nope", DOCUMENT, "POST"))).toBeUndefined();
  });

  it("reports nothing when the manifest is empty (an unbuilt or failed manifest)", () => {
    expect(eventFor(get("/docs/nope"), ok(), {})).toBeUndefined();
  });

  it("drops the query string from the reported url", () => {
    expect(eventFor(get("/docs/nope?q=secret"))?.url).toBe("/docs/nope");
  });
});

describe("markdown_view", () => {
  it.each([
    ["/docs.md", "suffix"],
    ["/docs/quickstart.md", "suffix"],
    ["/privacy.md", "suffix"],
    ["/index.md", "suffix"],
    ["/de/index.md", "suffix"],
    ["/de/docs/quickstart.md", "suffix"],
  ])("reports %s via %s", (path, via) => {
    expect(eventFor(get(path, { "user-agent": SAFARI }))).toEqual({
      url: path,
      name: "markdown_view",
      data: { via },
    });
  });

  it("reports a page requested with Accept: text/markdown via accept", () => {
    expect(
      eventFor(get("/docs/quickstart", { "user-agent": SAFARI, accept: "text/markdown" })),
    ).toEqual({ url: "/docs/quickstart", name: "markdown_view", data: { via: "accept" } });
  });

  it("reports the landing page requested with Accept: text/markdown", () => {
    expect(eventFor(get("/", { "user-agent": SAFARI, accept: "text/markdown" }))?.name).toBe(
      "markdown_view",
    );
  });

  it("reports nothing when HTML is preferred", () => {
    expect(
      eventFor(get("/docs", { ...DOCUMENT, accept: "text/html,text/markdown;q=0.5" })),
    ).toBeUndefined();
  });

  it.each([
    ["an unknown docs page", "/docs/nope.md"],
    ["an unknown site page", "/nope.md"],
    ["a page the markdown route does not serve", "/de/docs/nope.md"],
  ])("reports nothing for %s", (_case, path) => {
    expect(eventFor(get(path, { "user-agent": SAFARI }))?.name).not.toBe("markdown_view");
  });

  it("reports nothing for a redirect (a legacy .mdx path)", () => {
    const redirect = new Response(null, { status: 308, headers: { location: "/docs.md" } });
    expect(eventFor(get("/docs.md"), redirect)).toBeUndefined();
  });

  it("reports nothing for a non-GET method", () => {
    expect(eventFor(get("/docs.md", { "user-agent": SAFARI }, "POST"))).toBeUndefined();
  });
});
