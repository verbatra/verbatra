import type { NextFetchEvent } from "next/server";
import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

const i18nProxyMock = vi.fn(() => new Response(null, { status: 200 }));

vi.mock("fumadocs-core/i18n/middleware", () => ({
  createI18nMiddleware: () => i18nProxyMock,
}));

const { default: proxy } = await import("./proxy");

const event = {} as NextFetchEvent;

function request(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("http://localhost/", { headers });
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
});
