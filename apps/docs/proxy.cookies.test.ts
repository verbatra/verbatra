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
