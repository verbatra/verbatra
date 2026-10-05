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

  it("leaves a non-docs response without a Vary on Accept", async () => {
    const response = (await proxy(
      request({ accept: "text/markdown" }, "/contact"),
      event,
    )) as Response;
    expect(response.headers.get("vary")).toBeNull();
  });
});
