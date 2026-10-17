import { afterEach, describe, expect, it, vi } from "vitest";

const protectMock = vi.fn();
const sendContactEmailMock = vi.fn();

vi.mock("@arcjet/next", () => ({
  default: () => ({ protect: protectMock }),
  detectBot: () => ({}),
  fixedWindow: () => ({}),
  shield: () => ({}),
}));
vi.mock("./email", () => ({ sendContactEmail: sendContactEmailMock }));
vi.mock("fumadocs-core/i18n/middleware", () => ({
  createI18nMiddleware: () => () => new Response(null, { status: 200 }),
}));

const { POST } = await import("./route");
const { resetCachedClient } = await import("./arcjet");
const { config: proxyConfig } = await import("@/proxy");

const PUBLIC_CLIENT_IP = "84.132.10.7";
const FORWARDED_CHAIN = `${PUBLIC_CLIENT_IP}, 172.17.0.1`;
const originalArcjetKey = process.env.ARCJET_KEY;

function allowedDecision() {
  return {
    isDenied: () => false,
    isErrored: () => false,
    reason: { isRateLimit: () => false },
  };
}

afterEach(() => {
  protectMock.mockReset();
  sendContactEmailMock.mockReset();
  resetCachedClient();
  if (originalArcjetKey === undefined) {
    delete process.env.ARCJET_KEY;
  } else {
    process.env.ARCJET_KEY = originalArcjetKey;
  }
});

describe("the real client IP reaches Arcjet", () => {
  it("passes the incoming request to protect() with X-Forwarded-For and X-Real-IP untouched", async () => {
    process.env.ARCJET_KEY = "test-key";
    protectMock.mockResolvedValue(allowedDecision());
    sendContactEmailMock.mockResolvedValue({ ok: true });
    const incoming = new Request("https://verbatra.kreitz-webdev.de/api/contact", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Forwarded-For": FORWARDED_CHAIN,
        "X-Real-IP": PUBLIC_CLIENT_IP,
      },
      body: JSON.stringify({
        name: "Ada Lovelace",
        email: "ada@example.com",
        message: "Hello, I would like to know more about verbatra.",
      }),
    });
    const sentHeaders = [...incoming.headers.entries()];

    const response = await POST(incoming);

    expect(response.status).toBe(200);
    expect(protectMock).toHaveBeenCalledTimes(1);
    const received = protectMock.mock.calls[0]?.[0] as Request;
    expect(received).toBe(incoming);
    expect([...received.headers.entries()]).toEqual(sentHeaders);
    expect(received.headers.get("x-forwarded-for")).toBe(FORWARDED_CHAIN);
    expect(received.headers.get("x-real-ip")).toBe(PUBLIC_CLIENT_IP);
  });

  it("keeps the contact route outside the proxy matcher, so proxy.ts never rewrites its headers", () => {
    const matchers = proxyConfig.matcher.map((pattern) => new RegExp(`^${pattern}$`));
    expect(matchers.some((matcher) => matcher.test("/api/contact"))).toBe(false);
    expect(matchers.some((matcher) => matcher.test("/contact"))).toBe(true);
  });
});
