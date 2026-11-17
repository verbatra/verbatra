import type { NextFetchEvent } from "next/server";
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import proxy from "./proxy";

const event = {} as NextFetchEvent;

async function run(path: string, headers: Record<string, string> = {}): Promise<Response> {
  const response = await proxy(new NextRequest(`http://localhost${path}`, { headers }), event);
  if (!(response instanceof Response)) throw new Error(`proxy returned no response for ${path}`);
  return response;
}

describe("proxy: locale cookie", () => {
  it.each([
    ["/en/privacy", "/privacy"],
    ["/en", "/"],
    ["/en/docs/get-started", "/docs/get-started"],
  ])("redirects %s to %s without setting a cookie", async (path, location) => {
    const response = await run(path, { "accept-language": "de" });
    expect(response.status).toBe(307);
    expect(new URL(response.headers.get("location") ?? "").pathname).toBe(location);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it.each(["/", "/privacy", "/de", "/de/privacy", "/fr/docs"])(
    "serves %s without setting a cookie",
    async (path) => {
      const response = await run(path, { "accept-language": "fr" });
      expect(response.status).toBe(200);
      expect(response.headers.get("location")).toBeNull();
      expect(response.headers.get("set-cookie")).toBeNull();
    },
  );

  it("rewrites an unprefixed path to the default locale", async () => {
    const response = await run("/privacy", { "accept-language": "de" });
    expect(response.headers.get("x-middleware-rewrite")).toBe("http://localhost/en/privacy");
  });

  it("passes a prefixed non-default locale through untouched", async () => {
    const response = await run("/de/privacy");
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });
});

describe("proxy: legacy analytics opt-out migration", () => {
  const OFF = "verbatra_analytics=off; Secure; SameSite=Lax; Path=/; Max-Age=31536000";
  const EXPIRE_LEGACY =
    "verbatra_analytics_optout=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0";

  it("answers a request with the legacy cookie with the off choice cookie", async () => {
    const response = await run("/privacy", { cookie: "verbatra_analytics_optout=1" });
    expect(response.headers.getSetCookie()).toEqual([OFF, EXPIRE_LEGACY]);
  });

  it("migrates on a redirect as well", async () => {
    const response = await run("/en/privacy", { cookie: "verbatra_analytics_optout=1" });
    expect(response.status).toBe(307);
    expect(response.headers.getSetCookie()).toEqual([OFF, EXPIRE_LEGACY]);
  });

  it("only expires the legacy cookie when a choice cookie already exists", async () => {
    const response = await run("/privacy", {
      cookie: "verbatra_analytics_optout=1; verbatra_analytics=full",
    });
    expect(response.headers.getSetCookie()).toEqual([EXPIRE_LEGACY]);
  });

  it.each(["verbatra_analytics_optout=0", "verbatra_analytics=off", "theme=dark"])(
    "sets nothing for the cookie header %s",
    async (cookie) => {
      const response = await run("/privacy", { cookie });
      expect(response.headers.get("set-cookie")).toBeNull();
    },
  );
});
