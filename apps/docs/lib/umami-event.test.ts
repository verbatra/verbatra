import { describe, expect, it, vi } from "vitest";
import { UMAMI_WEBSITE_ID } from "./umami-config.mjs";
import { emitUmamiEvent, refererPage, umamiEventFor } from "./umami-event";
import type { UmamiMessage } from "./umami-send";

const SAFARI =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const HEADERS: Record<string, string> = {
  host: "verbatra.kreitz-webdev.de",
  "user-agent": SAFARI,
  "x-forwarded-for": "84.132.10.7, 172.17.0.1",
  "accept-language": "de-DE,de;q=0.9",
};

function request(headers: Record<string, string> = HEADERS): Request {
  return new Request("https://verbatra.kreitz-webdev.de/api/contact", { method: "POST", headers });
}

const SPEC = { url: "/contact", name: "contact_submit", data: { result: "ok" } } as const;

describe("umamiEventFor", () => {
  it("builds a named event carrying the visitor ip, user agent and language", () => {
    expect(umamiEventFor(request(), SPEC)).toEqual({
      type: "event",
      payload: {
        website: UMAMI_WEBSITE_ID,
        hostname: "verbatra.kreitz-webdev.de",
        url: "/contact",
        name: "contact_submit",
        data: { result: "ok" },
        userAgent: SAFARI,
        language: "de-DE",
        ip: "84.132.10.7",
      },
    });
  });

  it("builds a pageview without name and data when the spec has none", () => {
    const message = umamiEventFor(request(), { url: "/de/docs" });
    expect(message?.payload).not.toHaveProperty("name");
    expect(message?.payload).not.toHaveProperty("data");
    expect(message?.payload.url).toBe("/de/docs");
  });

  it("omits language when the request carries none", () => {
    const message = umamiEventFor(
      request({
        host: HEADERS.host as string,
        "user-agent": SAFARI,
        "x-forwarded-for": "84.132.10.7",
      }),
      SPEC,
    );
    expect(message?.payload.ip).toBe("84.132.10.7");
    expect(message?.payload).not.toHaveProperty("language");
  });

  it.each([
    ["Global Privacy Control", { ...HEADERS, "sec-gpc": "1" }],
    ["Do Not Track", { ...HEADERS, dnt: "1" }],
    ["the off choice", { ...HEADERS, cookie: "verbatra_analytics=off" }],
    ["the legacy opt-out cookie", { ...HEADERS, cookie: "verbatra_analytics_optout=1" }],
    ["a missing user agent", { ...HEADERS, "user-agent": " " }],
    ["a bot user agent", { ...HEADERS, "user-agent": "Googlebot/2.1; bot;" }],
    ["curl", { ...HEADERS, "user-agent": "curl/8.7.1" }],
    ["no public client ip", { host: HEADERS.host as string, "user-agent": SAFARI }],
    ["a private client ip", { ...HEADERS, "x-forwarded-for": "10.0.0.4" }],
    ["a local host", { ...HEADERS, host: "localhost:3000" }],
    [
      "a spoofed forwarded host behind a local host",
      { ...HEADERS, host: "localhost:3000", "x-forwarded-host": "verbatra.kreitz-webdev.de" },
    ],
  ])("returns nothing for %s", (_case, headers) => {
    expect(umamiEventFor(request(headers), SPEC)).toBeUndefined();
  });

  it("still sends for a visitor whose choice is full", () => {
    const headers = { ...HEADERS, cookie: "verbatra_analytics=full" };
    expect(umamiEventFor(request(headers), SPEC)).toBeDefined();
  });
});

describe("emitUmamiEvent", () => {
  it("hands the send to the scheduler once for an allowed request", async () => {
    const send = vi.fn(async (_message: UmamiMessage) => undefined);
    const schedule = vi.fn((task: () => Promise<void>) => void task());
    emitUmamiEvent(request(), SPEC, { schedule, send });
    expect(schedule).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]?.[0]).toMatchObject({ payload: { name: "contact_submit" } });
  });

  it("schedules nothing for a refused request", () => {
    const schedule = vi.fn();
    emitUmamiEvent(request({ ...HEADERS, "sec-gpc": "1" }), SPEC, { schedule });
    expect(schedule).not.toHaveBeenCalled();
  });

  it("never throws when the scheduler does", () => {
    const schedule = vi.fn(() => {
      throw new Error("outside a request scope");
    });
    expect(() => emitUmamiEvent(request(), SPEC, { schedule })).not.toThrow();
  });
});

describe("refererPage", () => {
  const ROUTES = { "/en/contact": [], "/de/contact": [], "/_not-found": [] };
  const withReferer = (referer: string) => request({ ...HEADERS, referer });

  it("returns the path of a same-site referer that is a page, without query or fragment", () => {
    expect(
      refererPage(
        withReferer("https://verbatra.kreitz-webdev.de/de/contact?x=1#top"),
        "/contact",
        ROUTES,
      ),
    ).toBe("/de/contact");
  });

  it("maps a default-locale public path to its served page", () => {
    expect(refererPage(withReferer("https://verbatra.kreitz-webdev.de/contact"), "/", ROUTES)).toBe(
      "/contact",
    );
  });

  it.each([
    ["a foreign referer", "https://evil.test/de/contact"],
    ["an unparsable referer", "not a url"],
    ["an overlong path", `https://verbatra.kreitz-webdev.de/${"a".repeat(300)}`],
    ["a same-site path that is no page", "https://verbatra.kreitz-webdev.de/jane.doe@example.com"],
    ["the not-found route", "https://verbatra.kreitz-webdev.de/_not-found"],
    ["a markdown variant", "https://verbatra.kreitz-webdev.de/de/contact.md"],
  ])("falls back for %s", (_case, referer) => {
    expect(refererPage(withReferer(referer), "/contact", ROUTES)).toBe("/contact");
  });

  it("falls back when there is no referer", () => {
    expect(refererPage(request(), "/contact", ROUTES)).toBe("/contact");
  });
});
