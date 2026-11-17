import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (task: () => Promise<void>) => void task(),
}));
vi.mock("@/lib/csp-script-hashes", () => ({
  loadBuiltScriptHashes: () => ({
    "/en": [],
    "/de": [],
    "/en/docs": [],
    "/en/docs/quickstart": [],
    "/de/docs": [],
    "/zh-CN/privacy": [],
    "/_not-found": [],
    "/_global-error": [],
  }),
}));

const { POST } = await import("./route");

const SAFARI =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const SITE = "https://verbatra.kreitz-webdev.de";
const IP = "84.132.10.7";
const fetchMock = vi.fn(async (..._args: unknown[]) => new Response("{}"));

let nextIp = 0;
function freshIp(): string {
  nextIp += 1;
  return `84.132.${Math.floor(nextIp / 250)}.${(nextIp % 250) + 1}`;
}

function relay(
  body: unknown,
  headers: Record<string, string> = {},
  init: { raw?: string } = {},
): Request {
  return new Request(`${SITE}/api/e`, {
    method: "POST",
    headers: {
      host: "verbatra.kreitz-webdev.de",
      origin: SITE,
      "sec-fetch-site": "same-origin",
      "user-agent": SAFARI,
      "accept-language": "de-DE,de;q=0.9",
      "content-type": "application/json",
      "x-forwarded-for": IP,
      ...headers,
    },
    body: init.raw ?? JSON.stringify(body),
  });
}

function sentMessages(): Array<{ payload: Record<string, unknown> }> {
  return fetchMock.mock.calls.map(([, init]) => JSON.parse(String((init as RequestInit).body)));
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockClear();
});

async function post(request: Request): Promise<Response> {
  return POST(request);
}

describe("POST /api/e", () => {
  it("relays a named event with its data, the visitor ip, user agent and language", async () => {
    const response = await post(
      relay(
        { e: "copy_code", p: { surface: "code-block" }, u: "/docs" },
        { "x-forwarded-for": freshIp() },
      ),
    );
    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sentMessages()[0]?.payload).toMatchObject({
      hostname: "verbatra.kreitz-webdev.de",
      url: "/docs",
      name: "copy_code",
      data: { surface: "code-block" },
      userAgent: SAFARI,
      language: "de-DE",
    });
    expect(sentMessages()[0]?.payload.ip).toMatch(/^84\.132\./);
  });

  it("relays a soft-navigation pageview without a name", async () => {
    await post(relay({ e: "pageview", u: "/de/docs" }, { "x-forwarded-for": freshIp() }));
    const payload = sentMessages()[0]?.payload ?? {};
    expect(payload.url).toBe("/de/docs");
    expect(payload).not.toHaveProperty("name");
    expect(payload).not.toHaveProperty("data");
  });

  it.each([
    ["/", "/"],
    ["/docs", "/docs"],
    ["/docs/quickstart", "/docs/quickstart"],
    ["/de", "/de"],
    ["/zh-CN/privacy", "/zh-CN/privacy"],
  ])("sends the public path %s unchanged when its served page exists", async (path, url) => {
    await post(relay({ e: "pageview", u: path }, { "x-forwarded-for": freshIp() }));
    expect(sentMessages()[0]?.payload.url).toBe(url);
  });

  it.each([
    ["an unknown page", "/nope"],
    ["an explicit default-locale prefix", "/en/docs"],
    ["a markdown variant", "/docs.md"],
    ["a trailing slash", "/docs/"],
    ["the not-found route", "/_not-found"],
    ["a path only the other locale has", "/de/docs/quickstart"],
  ])("drops a pageview for %s but still answers 204", async (_case, path) => {
    const response = await post(
      relay({ e: "pageview", u: path }, { "x-forwarded-for": freshIp() }),
    );
    expect(response.status).toBe(204);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ["an unknown event name", { e: "theme_switch", u: "/" }],
    ["a property outside the allowlist", { e: "copy_code", p: { surface: "x" }, u: "/" }],
    ["an extra key", { e: "pageview", u: "/", x: 1 }],
  ])("drops %s with the same 204", async (_case, body) => {
    const response = await post(relay(body, { "x-forwarded-for": freshIp() }));
    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(["", "not json", "[]"])("answers 204 and sends nothing for the body %j", async (raw) => {
    const response = await post(relay(undefined, { "x-forwarded-for": freshIp() }, { raw }));
    expect(response.status).toBe(204);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("drops a body over one kibibyte even when it is valid JSON", async () => {
    const padded = JSON.stringify({ e: "pageview", u: "/", pad: "x".repeat(1100) });
    const response = await post(
      relay(undefined, { "x-forwarded-for": freshIp() }, { raw: padded }),
    );
    expect(response.status).toBe(204);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("drops a body that exceeds the cap while streaming without a content-length", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(`{"e":"pageview","u":"/","pad":"${"x".repeat(2000)}"}`),
        );
        controller.close();
      },
    });
    const request = new Request(`${SITE}/api/e`, {
      method: "POST",
      headers: relay({}, { "x-forwarded-for": freshIp() }).headers,
      body: stream,
      duplex: "half",
    } as RequestInit);
    expect((await post(request)).status).toBe(204);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ["a foreign origin", { origin: "https://evil.test", "sec-fetch-site": "cross-site" }],
    ["a foreign origin with no fetch metadata", { origin: "https://evil.test" }],
    ["a cross-site fetch", { "sec-fetch-site": "cross-site" }],
    [
      "a same-site (sibling) fetch",
      { "sec-fetch-site": "same-site", origin: "https://evil.verbatra.kreitz-webdev.de" },
    ],
    ["a null origin", { origin: "null" }],
  ])("drops %s", async (_case, headers) => {
    const response = await post(
      relay({ e: "pageview", u: "/" }, { "x-forwarded-for": freshIp(), ...headers }),
    );
    expect(response.status).toBe(204);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("accepts a request with only Sec-Fetch-Site: same-origin", async () => {
    const headers = { "x-forwarded-for": freshIp() };
    const request = relay({ e: "pageview", u: "/" }, headers);
    request.headers.delete("origin");
    await post(request);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("accepts a request with only the site Origin", async () => {
    const request = relay({ e: "pageview", u: "/" }, { "x-forwarded-for": freshIp() });
    request.headers.delete("sec-fetch-site");
    await post(request);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("drops a request that proves no origin at all", async () => {
    const request = relay({ e: "pageview", u: "/" }, { "x-forwarded-for": freshIp() });
    request.headers.delete("sec-fetch-site");
    request.headers.delete("origin");
    expect((await post(request)).status).toBe(204);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ["Global Privacy Control", { "sec-gpc": "1" }],
    ["Do Not Track", { dnt: "1" }],
    ["the off choice", { cookie: "verbatra_analytics=off" }],
    ["the legacy opt-out cookie", { cookie: "verbatra_analytics_optout=1" }],
    ["a bot user agent", { "user-agent": "Googlebot/2.1; bot;" }],
    ["curl", { "user-agent": "curl/8.7.1" }],
    ["a blank user agent", { "user-agent": " " }],
    ["a local host", { host: "localhost:3000" }],
  ])("sends nothing for %s", async (_case, headers) => {
    const response = await post(
      relay({ e: "pageview", u: "/" }, { "x-forwarded-for": freshIp(), ...headers }),
    );
    expect(response.status).toBe(204);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends nothing when no public client ip can be derived", async () => {
    const request = relay({ e: "pageview", u: "/" });
    request.headers.delete("x-forwarded-for");
    expect((await post(request)).status).toBe(204);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("derives the client ip like the proxy: the right-most public forwarded address", async () => {
    await post(
      relay({ e: "pageview", u: "/" }, { "x-forwarded-for": "1.2.3.4, 84.132.9.9, 172.17.0.1" }),
    );
    expect(sentMessages()[0]?.payload.ip).toBe("84.132.9.9");
  });

  it("rate limits one ip to sixty events a minute and drops the rest with 204", async () => {
    const headers = { "x-forwarded-for": "84.200.1.1" };
    for (let call = 0; call < 70; call += 1) {
      const response = await post(relay({ e: "search_open", u: "/docs" }, headers));
      expect(response.status).toBe(204);
    }
    expect(fetchMock).toHaveBeenCalledTimes(60);
  });

  it("answers 204 and stays silent when the upstream send fails", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    const response = await post(relay({ e: "pageview", u: "/" }, { "x-forwarded-for": freshIp() }));
    expect(response.status).toBe(204);
    expect(error).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
    error.mockRestore();
    log.mockRestore();
  });

  it("never logs the client ip", async () => {
    const spies = (["log", "info", "warn", "error"] as const).map((level) =>
      vi.spyOn(console, level).mockImplementation(() => undefined),
    );
    await post(relay({ e: "pageview", u: "/" }, { "x-forwarded-for": freshIp() }));
    await post(relay({ e: "bogus" }, { "x-forwarded-for": freshIp() }));
    for (const spy of spies) {
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    }
  });

  it("does not export a GET handler", async () => {
    const module = await import("./route");
    expect(Object.keys(module).sort()).toEqual(["POST"]);
  });
});
