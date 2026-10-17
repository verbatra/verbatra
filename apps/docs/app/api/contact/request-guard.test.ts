import { describe, expect, it } from "vitest";
import { HONEYPOT_FIELD } from "./honeypot-field";
import {
  MAX_CONTACT_BODY_BYTES,
  readBodyWithinLimit,
  rejectUnacceptableRequest,
} from "./request-guard";

function request(headers: Record<string, string>, body = "{}"): Request {
  return new Request("http://localhost:3470/api/contact", { method: "POST", headers, body });
}

const JSON_HEADERS = { "Content-Type": "application/json" };

describe("rejectUnacceptableRequest", () => {
  it("accepts a JSON request without an Origin header", () => {
    expect(rejectUnacceptableRequest(request(JSON_HEADERS))).toBeUndefined();
  });

  it("accepts a JSON media type with a charset parameter in any case", () => {
    const accepted = request({ "Content-Type": "Application/JSON; charset=utf-8" });
    expect(rejectUnacceptableRequest(accepted)).toBeUndefined();
  });

  it.each([
    ["no content type", {}],
    ["urlencoded", { "Content-Type": "application/x-www-form-urlencoded" }],
    ["multipart", { "Content-Type": "multipart/form-data; boundary=x" }],
    ["plain text", { "Content-Type": "text/plain" }],
  ])("answers 415 for %s", (_label, headers) => {
    expect(rejectUnacceptableRequest(request(headers))?.status).toBe(415);
  });

  it("answers 413 when Content-Length declares more than the limit", () => {
    const oversized = request({
      ...JSON_HEADERS,
      "Content-Length": String(MAX_CONTACT_BODY_BYTES + 1),
    });
    expect(rejectUnacceptableRequest(oversized)?.status).toBe(413);
  });

  it("accepts a Content-Length at the limit", () => {
    const atLimit = request({ ...JSON_HEADERS, "Content-Length": String(MAX_CONTACT_BODY_BYTES) });
    expect(rejectUnacceptableRequest(atLimit)).toBeUndefined();
  });

  it("accepts the production site origin even when the proxy rewrote the Host header", () => {
    const fromSite = request({
      ...JSON_HEADERS,
      Origin: "https://verbatra.kreitz-webdev.de",
      Host: "127.0.0.1:3000",
    });
    expect(rejectUnacceptableRequest(fromSite)).toBeUndefined();
  });

  it("accepts an origin that matches the Host header, as a local server sees it", () => {
    const local = request({
      ...JSON_HEADERS,
      Origin: "http://localhost:3470",
      Host: "localhost:3470",
    });
    expect(rejectUnacceptableRequest(local)).toBeUndefined();
  });

  it.each([
    "https://evil.example",
    "null",
    "not a url",
    "http://verbatra.kreitz-webdev.de",
    "https://verbatra.kreitz-webdev.de:8443",
    "https://localhost:3470",
    "http://localhost:3471",
  ])("answers 403 for the foreign origin %s", (origin) => {
    const foreign = request({ ...JSON_HEADERS, Origin: origin, Host: "localhost:3470" });
    expect(rejectUnacceptableRequest(foreign)?.status).toBe(403);
  });

  it("accepts the production origin written with its default port", () => {
    const fromSite = request({
      ...JSON_HEADERS,
      Origin: "https://verbatra.kreitz-webdev.de:443",
      Host: "127.0.0.1:3000",
    });
    expect(rejectUnacceptableRequest(fromSite)).toBeUndefined();
  });

  it("takes the request's own scheme from X-Forwarded-Proto when the proxy sets it", () => {
    const headers = { ...JSON_HEADERS, Host: "docs.internal", "X-Forwarded-Proto": "https" };
    expect(
      rejectUnacceptableRequest(request({ ...headers, Origin: "https://docs.internal" })),
    ).toBeUndefined();
    expect(
      rejectUnacceptableRequest(request({ ...headers, Origin: "http://docs.internal" }))?.status,
    ).toBe(403);
  });

  it("answers 403 for a cross-site fetch even when the Origin header names the site", () => {
    const crossSite = request({
      ...JSON_HEADERS,
      Origin: "https://verbatra.kreitz-webdev.de",
      "Sec-Fetch-Site": "cross-site",
    });
    expect(rejectUnacceptableRequest(crossSite)?.status).toBe(403);
    expect(
      rejectUnacceptableRequest(request({ ...JSON_HEADERS, "Sec-Fetch-Site": "cross-site" }))
        ?.status,
    ).toBe(403);
  });

  it.each(["same-origin", "same-site", "none"])(
    "accepts a request without an Origin header whose Sec-Fetch-Site is %s",
    (site) => {
      const sameSite = request({ ...JSON_HEADERS, "Sec-Fetch-Site": site });
      expect(rejectUnacceptableRequest(sameSite)).toBeUndefined();
    },
  );
});

describe("readBodyWithinLimit", () => {
  it("returns the body text when it fits", async () => {
    expect(await readBodyWithinLimit(request(JSON_HEADERS, '{"a":1}'))).toBe('{"a":1}');
  });

  it("returns an empty string for a request without a body", async () => {
    const empty = new Request("http://localhost/api/contact", { method: "POST" });
    expect(await readBodyWithinLimit(empty)).toBe("");
  });

  it("returns undefined once the streamed body passes the limit", async () => {
    expect(await readBodyWithinLimit(request(JSON_HEADERS, "abcdef"), 5)).toBeUndefined();
  });

  it("decodes multi-byte characters split across chunks", async () => {
    const bytes = new TextEncoder().encode("äöü");
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, 1));
        controller.enqueue(bytes.slice(1));
        controller.close();
      },
    });
    const chunked = new Request("http://localhost/api/contact", {
      method: "POST",
      body: stream,
      duplex: "half",
    } as RequestInit);
    expect(await readBodyWithinLimit(chunked)).toBe("äöü");
  });

  it("fits the largest payload the form can send in three-byte characters", () => {
    const largest = JSON.stringify({
      name: "字".repeat(100),
      email: `${"a".repeat(64)}@${"b".repeat(185)}.de`,
      message: "字".repeat(5000),
      [HONEYPOT_FIELD]: "",
    });
    expect(new TextEncoder().encode(largest).byteLength).toBeLessThanOrEqual(
      MAX_CONTACT_BODY_BYTES,
    );
  });
});
