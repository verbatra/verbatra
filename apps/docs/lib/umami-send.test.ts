import { describe, expect, it, vi } from "vitest";
import { UMAMI_ORIGIN } from "./umami-config.mjs";
import { sendToUmami, UMAMI_SEND_TIMEOUT_MS, type UmamiMessage } from "./umami-send";

const EVENT: UmamiMessage = {
  type: "event",
  payload: {
    website: "site-id",
    hostname: "example.test",
    url: "/en/docs",
    name: "copy_code",
    data: { surface: "code-block" },
    userAgent: "Mozilla/5.0 Test",
    ip: "84.132.10.7",
  },
};

function okResponse(): Response {
  return new Response("{}", { status: 200 });
}

describe("sendToUmami", () => {
  it("posts the message as JSON to the Umami send endpoint with the visitor user agent", async () => {
    const send = vi.fn(async () => okResponse());
    await sendToUmami(EVENT, send as typeof fetch);
    expect(send).toHaveBeenCalledTimes(1);
    const [url, init] = send.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${UMAMI_ORIGIN}/api/send`);
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({
      "content-type": "application/json",
      "user-agent": "Mozilla/5.0 Test",
    });
    expect(JSON.parse(String(init.body))).toEqual(EVENT);
    expect(init.cache).toBe("no-store");
  });

  it("carries name and data for an event and neither for a pageview", async () => {
    const send = vi.fn(async () => okResponse());
    const { name: _name, data: _data, ...pageviewPayload } = EVENT.payload;
    await sendToUmami({ type: "event", payload: pageviewPayload }, send as typeof fetch);
    const [, init] = send.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(body.payload).not.toHaveProperty("name");
    expect(body.payload).not.toHaveProperty("data");
  });

  it("applies the shared timeout", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    await sendToUmami(EVENT, vi.fn(async () => okResponse()) as typeof fetch);
    expect(timeout).toHaveBeenCalledWith(UMAMI_SEND_TIMEOUT_MS);
    timeout.mockRestore();
  });

  it.each([
    ["a network error", () => Promise.reject(new Error("offline"))],
    [
      "a synchronous throw",
      () => {
        throw new Error("boom");
      },
    ],
  ])("never rejects and never logs on %s", async (_case, outcome) => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await expect(sendToUmami(EVENT, vi.fn(outcome) as typeof fetch)).resolves.toBeUndefined();
    expect(error).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    error.mockRestore();
    warn.mockRestore();
  });

  it("drains the response body", async () => {
    const cancel = vi.fn(async () => undefined);
    const response = { body: { cancel } } as unknown as Response;
    await sendToUmami(EVENT, vi.fn(async () => response) as typeof fetch);
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});
