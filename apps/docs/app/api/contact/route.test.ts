import { afterEach, describe, expect, it, vi } from "vitest";

const checkArcjetMock = vi.fn();
const sendContactEmailMock = vi.fn();

const emitUmamiEventMock = vi.fn();

vi.mock("@/lib/umami-event", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/umami-event")>()),
  emitUmamiEvent: emitUmamiEventMock,
}));
vi.mock("@/lib/csp-script-hashes", () => ({
  loadBuiltScriptHashes: () => ({ "/en": [], "/de/contact": [] }),
}));
vi.mock("./arcjet", () => ({ checkArcjet: checkArcjetMock }));
vi.mock("./email", () => ({ sendContactEmail: sendContactEmailMock }));

const { POST } = await import("./route");
const { HONEYPOT_FIELD } = await import("./honeypot-field");

function request(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/contact", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    name: "Ada Lovelace",
    email: "ada@example.com",
    message: "Hello, I would like to know more about verbatra.",
    ...overrides,
  };
}

afterEach(() => {
  checkArcjetMock.mockReset();
  sendContactEmailMock.mockReset();
  emitUmamiEventMock.mockReset();
});

describe("POST /api/contact", () => {
  it("returns the arcjet response unchanged when arcjet blocks the request", async () => {
    checkArcjetMock.mockResolvedValue(
      new Response(JSON.stringify({ status: "rate_limited" }), { status: 429 }),
    );
    const response = await POST(request(validBody()));
    expect(response.status).toBe(429);
    expect(sendContactEmailMock).not.toHaveBeenCalled();
  });

  it("returns 400 with field errors for an invalid payload", async () => {
    checkArcjetMock.mockResolvedValue(undefined);
    const response = await POST(request(validBody({ name: "" })));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body).toEqual({ status: "invalid", errors: { name: "required" } });
    expect(sendContactEmailMock).not.toHaveBeenCalled();
  });

  it("returns success and sends exactly one email for a valid payload", async () => {
    checkArcjetMock.mockResolvedValue(undefined);
    sendContactEmailMock.mockResolvedValue({ ok: true });
    const response = await POST(request(validBody()));
    expect(response.status).toBe(200);
    expect(sendContactEmailMock).toHaveBeenCalledTimes(1);
  });

  it("returns a byte-identical success response and sends no email when the honeypot is filled", async () => {
    checkArcjetMock.mockResolvedValue(undefined);
    sendContactEmailMock.mockResolvedValue({ ok: true });

    const success = await POST(request(validBody()));
    const honeypotted = await POST(
      request(validBody({ [HONEYPOT_FIELD]: "https://spam.example" })),
    );

    expect(honeypotted.status).toBe(success.status);
    expect(await honeypotted.text()).toBe(await success.text());
    expect(sendContactEmailMock).toHaveBeenCalledTimes(1);
  });

  it("returns 500 when the email send fails", async () => {
    checkArcjetMock.mockResolvedValue(undefined);
    sendContactEmailMock.mockResolvedValue({ ok: false });
    const response = await POST(request(validBody()));
    expect(response.status).toBe(500);
  });

  it("answers 415 before Arcjet for a no-JS urlencoded form post", async () => {
    const response = await POST(
      new Request("http://localhost/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "name=Ada&email=ada%40example.com&message=hello",
      }),
    );
    expect(response.status).toBe(415);
    expect(checkArcjetMock).not.toHaveBeenCalled();
    expect(sendContactEmailMock).not.toHaveBeenCalled();
  });

  it("answers 413 before Arcjet when the declared body exceeds the limit", async () => {
    const response = await POST(request(validBody(), { "Content-Length": "16385" }));
    expect(response.status).toBe(413);
    expect(checkArcjetMock).not.toHaveBeenCalled();
  });

  it("answers 413 and sends nothing when a body without a declared length exceeds the limit", async () => {
    checkArcjetMock.mockResolvedValue(undefined);
    const response = await POST(request(validBody({ message: "a".repeat(20_000) })));
    expect(response.status).toBe(413);
    expect(sendContactEmailMock).not.toHaveBeenCalled();
  });

  it("answers 403 for a cross-site Origin", async () => {
    const response = await POST(request(validBody(), { Origin: "https://evil.example" }));
    expect(response.status).toBe(403);
    expect(checkArcjetMock).not.toHaveBeenCalled();
  });

  it("answers 403 for a cross-site fetch without reaching Arcjet", async () => {
    const response = await POST(request(validBody(), { "Sec-Fetch-Site": "cross-site" }));
    expect(response.status).toBe(403);
    expect(checkArcjetMock).not.toHaveBeenCalled();
  });

  it("accepts a same-origin fetch that carries no Origin header", async () => {
    checkArcjetMock.mockResolvedValue(undefined);
    sendContactEmailMock.mockResolvedValue({ ok: true });
    const response = await POST(request(validBody(), { "Sec-Fetch-Site": "same-origin" }));
    expect(response.status).toBe(200);
    expect(sendContactEmailMock).toHaveBeenCalledTimes(1);
  });

  it("hands Arcjet the request with its public X-Forwarded-For client address intact", async () => {
    checkArcjetMock.mockResolvedValue(undefined);
    sendContactEmailMock.mockResolvedValue({ ok: true });
    const forwarded = "84.132.10.7, 172.17.0.1";
    await POST(request(validBody(), { "X-Forwarded-For": forwarded, "X-Real-IP": "84.132.10.7" }));
    const received = checkArcjetMock.mock.calls[0]?.[0] as Request;
    expect(received.headers.get("x-forwarded-for")).toBe(forwarded);
    expect(received.headers.get("x-real-ip")).toBe("84.132.10.7");
  });

  it("exports only POST, leaving other methods to Next.js's default 405 handling", async () => {
    const routeModule = (await import("./route")) as unknown as Record<string, unknown>;
    expect(routeModule.GET).toBeUndefined();
    expect(typeof routeModule.POST).toBe("function");
  });
});

describe("POST /api/contact analytics", () => {
  function emitted(): Array<{ url: string; name: string; data: Record<string, string> }> {
    return emitUmamiEventMock.mock.calls.map(([, spec]) => spec);
  }

  it("emits contact_submit ok after a delivered message, never with field values", async () => {
    checkArcjetMock.mockResolvedValue(undefined);
    sendContactEmailMock.mockResolvedValue({ ok: true });
    await POST(request(validBody()));
    expect(emitted()).toEqual([
      { url: "/contact", name: "contact_submit", data: { result: "ok" } },
    ]);
    expect(JSON.stringify(emitUmamiEventMock.mock.calls)).not.toContain("ada@example.com");
    expect(JSON.stringify(emitUmamiEventMock.mock.calls)).not.toContain("Lovelace");
  });

  it("takes the page from a same-site referer", async () => {
    checkArcjetMock.mockResolvedValue(undefined);
    sendContactEmailMock.mockResolvedValue({ ok: true });
    await POST(request(validBody(), { referer: "https://verbatra.kreitz-webdev.de/de/contact" }));
    expect(emitted()[0]?.url).toBe("/de/contact");
  });

  it("emits invalid for a rejected payload", async () => {
    checkArcjetMock.mockResolvedValue(undefined);
    await POST(request(validBody({ name: "" })));
    expect(emitted().map((spec) => spec.data.result)).toEqual(["invalid"]);
  });

  it("emits rate_limited when arcjet answers 429", async () => {
    checkArcjetMock.mockResolvedValue(new Response("{}", { status: 429 }));
    await POST(request(validBody()));
    expect(emitted().map((spec) => spec.data.result)).toEqual(["rate_limited"]);
  });

  it("emits error when the email could not be sent", async () => {
    checkArcjetMock.mockResolvedValue(undefined);
    sendContactEmailMock.mockResolvedValue({ ok: false });
    await POST(request(validBody()));
    expect(emitted().map((spec) => spec.data.result)).toEqual(["error"]);
  });

  it.each([["a blocked non-rate-limit request", new Response("{}", { status: 403 })]])(
    "emits nothing for %s",
    async (_case, blocked) => {
      checkArcjetMock.mockResolvedValue(blocked);
      await POST(request(validBody()));
      expect(emitUmamiEventMock).not.toHaveBeenCalled();
    },
  );

  it("emits nothing for a filled honeypot", async () => {
    checkArcjetMock.mockResolvedValue(undefined);
    await POST(request(validBody({ [HONEYPOT_FIELD]: "spam" })));
    expect(emitUmamiEventMock).not.toHaveBeenCalled();
    expect(sendContactEmailMock).not.toHaveBeenCalled();
  });

  it("emits nothing for an unacceptable request", async () => {
    const response = await POST(request(validBody(), { "Content-Type": "text/plain" }));
    expect(response.status).toBe(415);
    expect(emitUmamiEventMock).not.toHaveBeenCalled();
  });
});
