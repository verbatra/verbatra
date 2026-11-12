import { describe, expect, it } from "vitest";
import { formatWait, MAX_HONOURED_RETRY_DELAY_MS, statedRetryDelayMs } from "./retry-delay.js";

function geminiError(body: object): Error {
  return Object.assign(new Error(JSON.stringify(body)), { status: 429 });
}

describe("statedRetryDelayMs", () => {
  it("reads the RetryInfo retryDelay of a Google error body", () => {
    const error = geminiError({
      error: {
        details: [{ "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "26.5s" }],
      },
    });
    expect(statedRetryDelayMs(error)).toBe(26_500);
  });

  it("falls back to the duration in the message text", () => {
    expect(
      statedRetryDelayMs(geminiError({ error: { message: "Please retry in 2h28m49.5s." } })),
    ).toBe(8_929_500);
    expect(statedRetryDelayMs(geminiError({ error: { message: "Please retry in 3s." } }))).toBe(
      3_000,
    );
  });

  it("reads Retry-After from a Headers object, in seconds or milliseconds", () => {
    expect(statedRetryDelayMs({ status: 429, headers: new Headers({ "retry-after": "7" }) })).toBe(
      7_000,
    );
    expect(
      statedRetryDelayMs({ status: 429, headers: new Headers({ "retry-after-ms": "1500" }) }),
    ).toBe(1_500);
  });

  it("reads Retry-After from a plain header record whatever the key's case", () => {
    expect(statedRetryDelayMs({ status: 429, headers: { "Retry-After": "12" } })).toBe(12_000);
    expect(statedRetryDelayMs({ status: 429, headers: { "RETRY-AFTER-MS": "250" } })).toBe(250);
  });

  it("compares a stated wait to the cap exactly: 5000 ms is honoured, 5001 ms is not", () => {
    const stated = (delay: string) =>
      statedRetryDelayMs(
        geminiError({
          error: {
            details: [{ "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: delay }],
          },
        }),
      ) ?? 0;
    expect(stated("5s")).toBeLessThanOrEqual(MAX_HONOURED_RETRY_DELAY_MS);
    expect(stated("5.001s")).toBeGreaterThan(MAX_HONOURED_RETRY_DELAY_MS);
  });

  it("returns a huge stated wait unclamped, leaving the cap to the caller", () => {
    expect(statedRetryDelayMs({ headers: { "retry-after": "86400000" } })).toBe(86_400_000_000);
  });

  it("prefers the Google error body over a Retry-After header when they disagree", () => {
    const error = Object.assign(
      geminiError({
        error: {
          details: [{ "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "3s" }],
        },
      }),
      { headers: { "retry-after": "60" } },
    );
    expect(statedRetryDelayMs(error)).toBe(3_000);
  });

  it("reads Retry-After from a plain header record", () => {
    expect(statedRetryDelayMs({ status: 429, headers: { "retry-after": "12" } })).toBe(12_000);
  });

  it("states nothing for a past date, junk, zero or a non-JSON message", () => {
    expect(
      statedRetryDelayMs({
        headers: new Headers({ "retry-after": "Wed, 21 Oct 2026 07:28:00 GMT" }),
      }),
    ).toBeUndefined();
    expect(statedRetryDelayMs({ headers: { "retry-after": "0" } })).toBeUndefined();
    expect(statedRetryDelayMs(new Error("{not json"))).toBeUndefined();
    expect(statedRetryDelayMs("boom")).toBeUndefined();
    expect(statedRetryDelayMs(geminiError({ error: { details: "none" } }))).toBeUndefined();
  });
});

describe("statedRetryDelayMs: an HTTP-date Retry-After", () => {
  it("states the time remaining until a future date", () => {
    const at = new Date(Date.now() + 90_000).toUTCString();
    const stated = statedRetryDelayMs({ headers: new Headers({ "retry-after": at }) });
    expect(stated).toBeGreaterThan(80_000);
    expect(stated).toBeLessThanOrEqual(90_000);
  });

  it("states nothing for a date that has passed", () => {
    const at = new Date(Date.now() - 60_000).toUTCString();
    expect(statedRetryDelayMs({ headers: { "Retry-After": at } })).toBeUndefined();
  });
});

describe("formatWait", () => {
  it.each([
    [900, "1 s"],
    [26_500, "27 s"],
    [89_000, "2 min"],
    [90_000, "2 min"],
    [8_929_000, "2 h 29 min"],
    [7_200_000, "2 h"],
    [59_000, "59 s"],
    [59_600, "1 min"],
    [60_000, "1 min"],
    [3_599_600, "1 h"],
    [3_540_000, "59 min"],
  ])("renders %i ms as %s", (milliseconds, text) => {
    expect(formatWait(milliseconds)).toBe(text);
  });
});
