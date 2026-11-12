import { describe, expect, it } from "vitest";
import { formatWait, statedRetryDelayMs } from "./retry-delay.js";

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

  it("reads Retry-After from a plain header record", () => {
    expect(statedRetryDelayMs({ status: 429, headers: { "retry-after": "12" } })).toBe(12_000);
  });

  it("states nothing for a date, junk, zero or a non-JSON message", () => {
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

describe("formatWait", () => {
  it.each([
    [900, "1 s"],
    [26_500, "27 s"],
    [90_000, "2 min"],
    [8_929_000, "2 h 29 min"],
    [7_200_000, "2 h"],
  ])("renders %i ms as %s", (milliseconds, text) => {
    expect(formatWait(milliseconds)).toBe(text);
  });
});
