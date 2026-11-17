// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { report, reportPageview } from "./analytics-report";

const sendBeacon = vi.fn<(url: string, data: Blob) => boolean>();

async function beaconBody(): Promise<unknown> {
  const blob = sendBeacon.mock.calls[0]?.[1];
  return JSON.parse(await (blob as Blob).text());
}

beforeEach(() => {
  window.history.replaceState(null, "", "/de/docs/cli?q=secret#frag");
  sendBeacon.mockReset().mockReturnValue(true);
  Object.defineProperty(navigator, "sendBeacon", { value: sendBeacon, configurable: true });
});

afterEach(() => {
  Reflect.deleteProperty(navigator, "sendBeacon");
  vi.unstubAllGlobals();
});

describe("report", () => {
  it("posts the event, its properties and the bare page path to the relay as JSON", async () => {
    report("copy_code", { surface: "command-row" });
    expect(sendBeacon).toHaveBeenCalledExactlyOnceWith("/api/e", expect.any(Blob));
    expect(sendBeacon.mock.calls[0]?.[1].type).toBe("application/json");
    expect(await beaconBody()).toEqual({
      e: "copy_code",
      p: { surface: "command-row" },
      u: "/de/docs/cli",
    });
  });

  it("omits the properties of an event that has none", async () => {
    report("search_open");
    expect(await beaconBody()).toEqual({ e: "search_open", u: "/de/docs/cli" });
  });

  it("falls back to a keepalive fetch that still carries same-origin cookies when the beacon is refused", () => {
    sendBeacon.mockReturnValue(false);
    const fetchMock = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));
    vi.stubGlobal("fetch", fetchMock);
    report("search_open");
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
      "/api/e",
      expect.objectContaining({
        method: "POST",
        keepalive: true,
        credentials: "same-origin",
        body: JSON.stringify({ e: "search_open", u: "/de/docs/cli" }),
      }),
    );
  });

  it("falls back to fetch when the browser has no sendBeacon", () => {
    Reflect.deleteProperty(navigator, "sendBeacon");
    const fetchMock = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));
    vi.stubGlobal("fetch", fetchMock);
    report("mcp_install_click");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("never throws or rejects when every transport fails", async () => {
    sendBeacon.mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.stubGlobal("fetch", () => Promise.reject(new Error("offline")));
    expect(() => report("search_open")).not.toThrow();
    await Promise.resolve();
  });

  it("never throws when fetch itself throws", () => {
    sendBeacon.mockReturnValue(false);
    vi.stubGlobal("fetch", () => {
      throw new Error("blocked");
    });
    expect(() => report("search_open")).not.toThrow();
  });
});

describe("reportPageview", () => {
  it("posts a bare pageview for the path it is given, without a name property", async () => {
    reportPageview("/docs/sdk");
    expect(await beaconBody()).toEqual({ e: "pageview", u: "/docs/sdk" });
  });
});

describe("what the reporter reads", () => {
  it("never touches cookies, storage, screen, language, referrer or title", () => {
    const touched: string[] = [];
    const watch = (target: object, key: string) =>
      Object.defineProperty(target, key, {
        configurable: true,
        get() {
          touched.push(key);
          return undefined;
        },
      });
    watch(document, "cookie");
    watch(document, "referrer");
    watch(document, "title");
    watch(navigator, "language");
    watch(navigator, "languages");
    watch(navigator, "userAgent");
    watch(window, "screen");
    watch(window, "localStorage");
    watch(window, "sessionStorage");
    report("copy_code", { surface: "code-block" });
    reportPageview("/docs");
    for (const [target, key] of [
      [document, "cookie"],
      [document, "referrer"],
      [document, "title"],
      [navigator, "language"],
      [navigator, "languages"],
      [navigator, "userAgent"],
      [window, "screen"],
      [window, "localStorage"],
      [window, "sessionStorage"],
    ] as const) {
      Reflect.deleteProperty(target, key);
    }
    expect(touched).toEqual([]);
  });
});
