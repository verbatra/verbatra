import type { NextFetchEvent } from "next/server";
import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

const i18nProxyMock = vi.fn(() => new Response(null, { status: 200 }));

vi.mock("fumadocs-core/i18n/middleware", () => ({
  createI18nMiddleware: () => i18nProxyMock,
}));

const { default: proxy } = await import("./proxy");

const event = {} as NextFetchEvent;

function request(headers: Record<string, string> = {}, path = "/"): NextRequest {
  return new NextRequest(`http://localhost${path}`, { headers });
}

describe("proxy", () => {
  it("rejects a request carrying a Next-Action header with a 404 and skips the i18n proxy", async () => {
    const response = await proxy(request({ "Next-Action": "x" }), event);
    expect(response).not.toBeNull();
    expect(response).not.toBeUndefined();
    expect((response as Response).status).toBe(404);
    expect(i18nProxyMock).not.toHaveBeenCalled();
  });

  it("delegates to the i18n proxy when no Next-Action header is present", async () => {
    const req = request();
    await proxy(req, event);
    expect(i18nProxyMock).toHaveBeenCalledWith(req, event);
  });

  it("serves a docs page ending in .md from the markdown route without the i18n proxy", async () => {
    i18nProxyMock.mockClear();
    const response = (await proxy(request({}, "/de/docs/formats.md"), event)) as Response;
    expect(response.headers.get("x-middleware-rewrite")).toBe(
      "http://localhost/de/docs.mdx/formats",
    );
    expect(response.headers.get("vary")).toContain("Accept");
    expect(i18nProxyMock).not.toHaveBeenCalled();
  });

  it("serves markdown for a docs page when the Accept header prefers it", async () => {
    const response = (await proxy(
      request({ accept: "text/markdown" }, "/docs/providers"),
      event,
    )) as Response;
    expect(response.headers.get("x-middleware-rewrite")).toBe(
      "http://localhost/en/docs.mdx/providers",
    );
  });

  it("marks an html docs response as varying on Accept", async () => {
    const response = (await proxy(
      request({ accept: "text/html" }, "/docs/providers"),
      event,
    )) as Response;
    expect(response.headers.get("vary")).toContain("Accept");
  });

  it("serves the comparison page ending in .md from its markdown route", async () => {
    i18nProxyMock.mockClear();
    const response = (await proxy(request({}, "/es/compare.md"), event)) as Response;
    expect(response.headers.get("x-middleware-rewrite")).toBe(
      "http://localhost/es/site.mdx/compare",
    );
    expect(response.headers.get("vary")).toContain("Accept");
    expect(i18nProxyMock).not.toHaveBeenCalled();
  });

  it("serves markdown for the comparison page when the Accept header prefers it", async () => {
    const response = (await proxy(
      request({ accept: "text/markdown" }, "/compare"),
      event,
    )) as Response;
    expect(response.headers.get("x-middleware-rewrite")).toBe(
      "http://localhost/en/site.mdx/compare",
    );
  });

  it("marks the html comparison page as varying on Accept", async () => {
    const response = (await proxy(
      request({ accept: "text/html" }, "/de/compare"),
      event,
    )) as Response;
    expect(response.headers.get("vary")).toContain("Accept");
  });

  it("leaves a page without a markdown variant without a Vary on Accept", async () => {
    const response = (await proxy(
      request({ accept: "text/markdown" }, "/does-not-exist"),
      event,
    )) as Response;
    expect(response.headers.get("vary")).toBeNull();
  });

  it.each([
    ["/", "http://localhost/en/site.mdx/index"],
    ["/de", "http://localhost/de/site.mdx/index"],
    ["/imprint", "http://localhost/en/site.mdx/imprint"],
    ["/fr/privacy", "http://localhost/fr/site.mdx/privacy"],
  ])("serves markdown for %s when the Accept header prefers it", async (path, target) => {
    const response = (await proxy(request({ accept: "text/markdown" }, path), event)) as Response;
    expect(response.headers.get("x-middleware-rewrite")).toBe(target);
    expect(response.headers.get("vary")).toContain("Accept");
  });

  it.each([
    ["/index.md", "http://localhost/en/site.mdx/index"],
    ["/es/index.md", "http://localhost/es/site.mdx/index"],
    ["/licenses.md", "http://localhost/en/site.mdx/licenses"],
    ["/de/contact.md", "http://localhost/de/site.mdx/contact"],
  ])("serves %s from the site markdown route", async (path, target) => {
    const response = (await proxy(request({}, path), event)) as Response;
    expect(response.headers.get("x-middleware-rewrite")).toBe(target);
  });

  it("marks the html landing page as varying on Accept", async () => {
    const response = (await proxy(request({ accept: "text/html" }, "/"), event)) as Response;
    expect(response.headers.get("vary")).toContain("Accept");
  });

  it.each([
    ["/docs/quickstart.mdx", "/docs/quickstart.md"],
    ["/de/docs.mdx", "/de/docs.md"],
    ["/compare.mdx", "/compare.md"],
    ["/fr/compare.mdx", "/fr/compare.md"],
    ["/index.mdx", "/index.md"],
    ["/docs.mdx/cli/translate", "/docs/cli/translate.md"],
    ["/de/docs.mdx/formats", "/de/docs/formats.md"],
    ["/site.mdx/imprint", "/imprint.md"],
    ["/de/site.mdx/index", "/de/index.md"],
  ])("redirects the .mdx url %s to its markdown url %s", async (path, target) => {
    i18nProxyMock.mockClear();
    const response = (await proxy(request({}, path), event)) as Response;
    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe(`http://localhost${target}`);
    expect(i18nProxyMock).not.toHaveBeenCalled();
  });

  it.each(["/nothing-here.mdx", "/xx/docs.mdx/formats", "/site.mdx/unknown"])(
    "hands the .mdx url %s without a markdown variant to the i18n proxy",
    async (path) => {
      i18nProxyMock.mockClear();
      const response = (await proxy(request({}, path), event)) as Response;
      expect(response.status).toBe(200);
      expect(i18nProxyMock).toHaveBeenCalled();
    },
  );
});
