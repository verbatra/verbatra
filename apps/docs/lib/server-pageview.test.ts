import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ANALYTICS_OPT_OUT_COOKIE,
  clientIp,
  countedPageview,
  isCountableNavigation,
  isPublicAddress,
  isTrackingRefused,
  MAX_LANGUAGE_LENGTH,
  MAX_REFERRER_LENGTH,
  PAGEVIEW_TIMEOUT_MS,
  type Pageview,
  pageviewFor,
  sendPageview,
  UMAMI_ORIGIN,
  UMAMI_WEBSITE_ID,
} from "./server-pageview";

const SAFARI =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const PRODUCTION = "https://verbatra.kreitz-webdev.de";
const ROUTES = { "/en": [], "/de/docs": [], "/_not-found": [], "/_global-error": [] };

const NAVIGATION_HEADERS: Record<string, string> = {
  host: "verbatra.kreitz-webdev.de",
  "sec-fetch-dest": "document",
  "sec-fetch-mode": "navigate",
  "user-agent": SAFARI,
};

function navigation(
  path = "/",
  headers: Record<string, string | null> = {},
  method = "GET",
): Request {
  const merged = new Headers(NAVIGATION_HEADERS);
  for (const [name, value] of Object.entries(headers)) {
    if (value === null) merged.delete(name);
    else merged.set(name, value);
  }
  return new Request(`${PRODUCTION}${path}`, { method, headers: merged });
}

const PAGE = new Response(null, { status: 200 });

function counted(request: Request, served = "/en", response: Response = PAGE) {
  return countedPageview(request, response, served, ROUTES);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("countedPageview", () => {
  it("counts a top-level document navigation to a prerendered page on the production host", () => {
    expect(counted(navigation())?.payload.url).toBe("/");
    expect(counted(navigation("/de/docs"), "/de/docs")?.payload.url).toBe("/de/docs");
  });

  it.each([
    ["an RSC or fetch request with an empty destination", { "sec-fetch-dest": "empty" }],
    ["a request without fetch metadata", { "sec-fetch-dest": null, "sec-fetch-mode": null }],
    ["a no-cors subresource request", { "sec-fetch-mode": "no-cors" }],
    ["a speculation-rules prefetch", { "sec-purpose": "prefetch" }],
    ["a prerender", { "sec-purpose": "prefetch;prerender" }],
    ["a legacy prefetch", { purpose: "prefetch" }],
    ["curl", { "user-agent": "curl/8.7.1" }],
    ["node fetch", { "user-agent": "node" }],
    ["headless Chrome", { "user-agent": "Mozilla/5.0 HeadlessChrome/120.0 Safari/537.36" }],
    ["a crawler", { "user-agent": "Mozilla/5.0 (compatible; Googlebot/2.1)" }],
    ["an empty user agent", { "user-agent": "" }],
    ["a missing user agent", { "user-agent": null }],
    ["Global Privacy Control", { "sec-gpc": "1" }],
    ["Do Not Track", { dnt: "1" }],
    ["the opt-out cookie", { cookie: `theme=x; ${ANALYTICS_OPT_OUT_COOKIE}=1` }],
    ["a local host", { host: "localhost:3480" }],
    ["a forwarded foreign host", { host: null, "x-forwarded-host": "preview.example.com" }],
    [
      "a spoofed X-Forwarded-Host behind a local Host",
      { host: "localhost:3480", "x-forwarded-host": "verbatra.kreitz-webdev.de" },
    ],
    [
      "a spoofed first X-Forwarded-Host value",
      { host: null, "x-forwarded-host": "verbatra.kreitz-webdev.de, localhost" },
    ],
  ])("skips %s", (_case, headers) => {
    expect(counted(navigation("/", headers))).toBeUndefined();
  });

  it("skips a HEAD request", () => {
    expect(counted(navigation("/", {}, "HEAD"))).toBeUndefined();
  });

  it("skips a redirect", () => {
    const redirect = new Response(null, { status: 307, headers: { location: "/privacy" } });
    expect(counted(navigation("/en/privacy"), "/en/privacy", redirect)).toBeUndefined();
  });

  it("skips the not-found and global-error routes and paths outside the manifest", () => {
    expect(counted(navigation("/missing"), "/_not-found")).toBeUndefined();
    expect(counted(navigation("/missing"), "/_global-error")).toBeUndefined();
    expect(counted(navigation("/missing"), "/en/missing")).toBeUndefined();
  });

  it("skips the markdown variant of a docs page", () => {
    expect(counted(navigation("/de/docs.md"), "/de/docs")).toBeUndefined();
    expect(counted(navigation("/de/docs"), "/de/docs.mdx")).toBeUndefined();
  });

  it("counts the production Host even when a client sends X-Forwarded-Host", () => {
    const request = navigation("/", { "x-forwarded-host": "localhost, preview.example.com" });
    expect(counted(request)).toBeDefined();
  });

  it("counts the last X-Forwarded-Host value when Host is absent", () => {
    const request = navigation("/", {
      host: null,
      "x-forwarded-host": "localhost, verbatra.kreitz-webdev.de",
    });
    expect(counted(request)).toBeDefined();
  });

  it("does not count GPC or DNT values other than 1, or a cleared cookie", () => {
    expect(counted(navigation("/", { "sec-gpc": "0", dnt: "0" }))).toBeDefined();
    expect(counted(navigation("/", { cookie: `${ANALYTICS_OPT_OUT_COOKIE}=` }))).toBeDefined();
  });
});

describe("isCountableNavigation", () => {
  it("reads the prerendered routes from the given manifest", () => {
    expect(isCountableNavigation(navigation(), PAGE, "/en", {})).toBe(false);
    expect(isCountableNavigation(navigation(), PAGE, "/en", { "/en": [] })).toBe(true);
  });
});

describe("isTrackingRefused", () => {
  it("is false for a request without any opt-out signal", () => {
    expect(isTrackingRefused(new Headers({ cookie: "theme=dark" }))).toBe(false);
  });
});

describe("clientIp", () => {
  it.each([
    ["the right-most public forwarded address", "8.8.8.8, 84.132.10.7, 172.17.0.1", "84.132.10.7"],
    [
      "a public address behind loopback and private hops",
      "84.132.10.7, 10.0.0.2, 127.0.0.1",
      "84.132.10.7",
    ],
    [
      "a public address behind CGNAT and link-local hops",
      "84.132.10.7, 100.64.1.1, 169.254.1.1",
      "84.132.10.7",
    ],
    ["an address with a port", "84.132.10.7:51234", "84.132.10.7"],
    ["a bracketed IPv6 address with a port", "[2a02:810d:1:2::5]:443", "2a02:810d:1:2::5"],
    [
      "a public IPv6 address behind a unique local hop",
      "2a02:810d:1:2::5, fd00::1",
      "2a02:810d:1:2::5",
    ],
  ])("takes %s", (_case, forwarded, expected) => {
    expect(clientIp(new Headers({ "x-forwarded-for": forwarded }))).toBe(expected);
  });

  it("takes the right-most public address because nginx is the only hop and appends the peer it saw", () => {
    const spoofedByClient = "1.1.1.1";
    const peerSeenByNginx = "84.132.10.7";
    const headers = new Headers({ "x-forwarded-for": `${spoofedByClient}, ${peerSeenByNginx}` });

    expect(clientIp(headers)).toBe(peerSeenByNginx);
  });

  it("falls back to X-Real-IP when no forwarded address is public", () => {
    const headers = new Headers({ "x-forwarded-for": "172.17.0.1", "x-real-ip": "84.132.10.7" });
    expect(clientIp(headers)).toBe("84.132.10.7");
  });

  it("omits the address when none is public or the header is garbage", () => {
    expect(
      clientIp(new Headers({ "x-forwarded-for": "10.1.2.3", "x-real-ip": "192.168.1.4" })),
    ).toBe(undefined);
    expect(clientIp(new Headers({ "x-forwarded-for": "unknown, not-an-ip" }))).toBeUndefined();
    expect(clientIp(new Headers())).toBeUndefined();
  });

  it.each([
    "::1",
    "::",
    "fe80::1",
    "fe80::1%eth0",
    "fc00::1",
    "fdff:ffff::1",
    "::ffff:10.0.0.1",
    "::ffff:7f00:1",
    "::FFFF:C0A8:0101",
    "0.1.2.3",
    "172.31.255.255",
    "224.0.0.1",
    "239.255.255.250",
    "255.255.255.255",
    "192.0.0.8",
    "192.0.2.1",
    "198.18.0.1",
    "198.19.255.254",
    "198.51.100.7",
    "203.0.113.9",
    "ff02::1",
    "ff0e::101",
    "2001:db8::1",
    "2001:db8:ffff::1",
    "64:ff9b::808:808",
    "64:ff9b::8.8.8.8",
  ])("treats %s as non-public", (address) => {
    expect(isPublicAddress(address)).toBe(false);
  });

  it.each([
    "172.32.0.1",
    "100.128.0.1",
    "192.0.3.1",
    "198.17.255.255",
    "198.20.0.1",
    "203.0.114.1",
    "223.255.255.255",
    "::ffff:84.132.10.7",
    "::ffff:5484:a07",
    "2001:4860:4860::8888",
    "2001:db9::1",
    "64:ff9b:1::1",
    "fe00::1",
  ])("treats %s as public", (address) => {
    expect(isPublicAddress(address)).toBe(true);
  });
});

describe("pageviewFor", () => {
  it("builds the Umami event with the visitor's details and no query or fragment", () => {
    const request = navigation("/de/docs?utm_source=x#install", {
      referer: "https://news.example.com/item?id=42",
      "accept-language": "de-DE,de;q=0.9,en;q=0.8",
      "x-forwarded-for": "84.132.10.7, 172.17.0.1",
    });

    expect(pageviewFor(request)).toEqual({
      type: "event",
      payload: {
        website: UMAMI_WEBSITE_ID,
        hostname: "verbatra.kreitz-webdev.de",
        url: "/de/docs",
        referrer: "https://news.example.com/item",
        language: "de-DE",
        ip: "84.132.10.7",
        userAgent: SAFARI,
      },
    });
  });

  it("drops a language tag longer than the cap and keeps one at the cap", () => {
    const atCap = "a".repeat(MAX_LANGUAGE_LENGTH);
    const kept = pageviewFor(navigation("/", { "accept-language": atCap }));
    const dropped = pageviewFor(navigation("/", { "accept-language": `${atCap}b` }));

    expect(MAX_LANGUAGE_LENGTH).toBe(35);
    expect(kept?.payload.language).toBe(atCap);
    expect(dropped?.payload).not.toHaveProperty("language");
  });

  it("drops a referrer longer than the cap and keeps one at the cap", () => {
    const origin = "https://news.example.com/";
    const atCap = `${origin}${"p".repeat(MAX_REFERRER_LENGTH - origin.length)}`;
    const kept = pageviewFor(navigation("/", { referer: `${atCap}?id=1` }));
    const dropped = pageviewFor(navigation("/", { referer: `${atCap}p` }));

    expect(MAX_REFERRER_LENGTH).toBe(500);
    expect(kept?.payload.referrer).toBe(atCap);
    expect(dropped?.payload).not.toHaveProperty("referrer");
  });

  it("leaves out a referrer, language and address it does not have", () => {
    const pageview = pageviewFor(navigation("/", { referer: "not a url", "accept-language": "*" }));

    expect(Object.keys(pageview?.payload ?? {}).sort()).toEqual([
      "hostname",
      "url",
      "userAgent",
      "website",
    ]);
  });
});

describe("sendPageview", () => {
  const pageview: Pageview = {
    type: "event",
    payload: { website: UMAMI_WEBSITE_ID, hostname: "h", url: "/", userAgent: SAFARI },
  };

  it("posts the event to the self-hosted Umami API with the visitor's user agent and a timeout", async () => {
    const send = vi.fn(
      async (_url: string | URL | Request, _init?: RequestInit) => new Response("{}"),
    );
    const timeout = vi.spyOn(AbortSignal, "timeout");

    await sendPageview(pageview, send as typeof fetch);

    expect(send).toHaveBeenCalledTimes(1);
    const [url, init] = send.mock.calls[0] ?? [];
    expect(url).toBe(`${UMAMI_ORIGIN}/api/send`);
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("user-agent")).toBe(SAFARI);
    expect(new Headers(init?.headers).get("content-type")).toBe("application/json");
    expect(JSON.parse(String(init?.body))).toEqual(pageview);
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(timeout).toHaveBeenCalledWith(PAGEVIEW_TIMEOUT_MS);
  });

  it.each([
    ["a rejected request", () => Promise.reject(new Error("connect ECONNREFUSED 84.132.10.7"))],
    [
      "a timed-out request",
      () =>
        Promise.reject(
          new DOMException("The operation was aborted due to timeout", "TimeoutError"),
        ),
    ],
    ["a server error", () => Promise.resolve(new Response("boom", { status: 500 }))],
  ])("resolves quietly after %s", async (_case, outcome) => {
    const consoleSpies = (["log", "info", "warn", "error", "debug"] as const).map((level) =>
      vi.spyOn(console, level).mockImplementation(() => undefined),
    );

    await expect(sendPageview(pageview, vi.fn(outcome) as typeof fetch)).resolves.toBeUndefined();
    for (const spy of consoleSpies) expect(spy).not.toHaveBeenCalled();
  });

  it("gives up when the Umami server does not answer within the timeout", async () => {
    vi.useFakeTimers();
    const send = vi.fn(
      (_url: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
        }),
    );
    const done = sendPageview(pageview, send as typeof fetch);
    await vi.advanceTimersByTimeAsync(PAGEVIEW_TIMEOUT_MS);
    await expect(done).resolves.toBeUndefined();
    vi.useRealTimers();
  });
});

describe("server-pageview module", () => {
  it("is server-only", () => {
    const source = readFileSync(new URL("./server-pageview.ts", import.meta.url), "utf8");
    expect(source.startsWith('import "server-only";\n')).toBe(true);
  });
});
