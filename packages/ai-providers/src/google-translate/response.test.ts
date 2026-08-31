import { describe, expect, it } from "vitest";
import { entry } from "../test-support.js";
import { parseGoogleTranslateHttpResult, zipResults } from "./response.js";

describe("parseGoogleTranslateHttpResult: success", () => {
  it("extracts translatedText in order from a 200 response", () => {
    const body = { data: { translations: [{ translatedText: "A" }, { translatedText: "B" }] } };
    expect(parseGoogleTranslateHttpResult(200, body)).toEqual(["A", "B"]);
  });

  it("rejects a malformed 2xx body as INVALID_RESPONSE", () => {
    expect(() => parseGoogleTranslateHttpResult(200, { unexpected: true })).toThrow(
      expect.objectContaining({ code: "INVALID_RESPONSE" }),
    );
  });
});

describe("parseGoogleTranslateHttpResult: error classification", () => {
  it("maps HTTP 400 to INVALID_REQUEST", () => {
    expect(() => parseGoogleTranslateHttpResult(400, { error: { errors: [] } })).toThrow(
      expect.objectContaining({ code: "INVALID_REQUEST" }),
    );
  });

  it("maps HTTP 401 to AUTH_FAILED", () => {
    expect(() => parseGoogleTranslateHttpResult(401, { error: { errors: [] } })).toThrow(
      expect.objectContaining({ code: "AUTH_FAILED" }),
    );
  });

  it("maps HTTP 403 with no recognizable reason to AUTH_FAILED", () => {
    expect(() =>
      parseGoogleTranslateHttpResult(403, { error: { errors: [{ reason: "keyInvalid" }] } }),
    ).toThrow(expect.objectContaining({ code: "AUTH_FAILED" }));
  });

  it.each([
    "dailyLimitExceeded",
    "dailyLimitExceededUnreg",
    "userRateLimitExceeded",
    "rateLimitExceeded",
  ])("maps HTTP 403 with reason %s to RATE_LIMITED, not AUTH_FAILED", (reason) => {
    expect(() => parseGoogleTranslateHttpResult(403, { error: { errors: [{ reason }] } })).toThrow(
      expect.objectContaining({ code: "RATE_LIMITED" }),
    );
  });

  it("maps HTTP 429 to RATE_LIMITED", () => {
    expect(() => parseGoogleTranslateHttpResult(429, { error: { errors: [] } })).toThrow(
      expect.objectContaining({ code: "RATE_LIMITED" }),
    );
  });

  it("maps HTTP 5xx to PROVIDER_UNAVAILABLE", () => {
    expect(() => parseGoogleTranslateHttpResult(503, { error: { errors: [] } })).toThrow(
      expect.objectContaining({ code: "PROVIDER_UNAVAILABLE" }),
    );
  });

  it("maps an unclassifiable status to PROVIDER_ERROR", () => {
    expect(() => parseGoogleTranslateHttpResult(418, { error: { errors: [] } })).toThrow(
      expect.objectContaining({ code: "PROVIDER_ERROR" }),
    );
  });

  it("classifies an error status even with a malformed or absent error body", () => {
    expect(() => parseGoogleTranslateHttpResult(500, undefined)).toThrow(
      expect.objectContaining({ code: "PROVIDER_UNAVAILABLE" }),
    );
  });

  it("classifies a 403 with no errors array at all as AUTH_FAILED (no reason to inspect)", () => {
    expect(() => parseGoogleTranslateHttpResult(403, { error: {} })).toThrow(
      expect.objectContaining({ code: "AUTH_FAILED" }),
    );
  });

  it("classifies a 403 with an error entry that omits reason as AUTH_FAILED", () => {
    expect(() => parseGoogleTranslateHttpResult(403, { error: { errors: [{}] } })).toThrow(
      expect.objectContaining({ code: "AUTH_FAILED" }),
    );
  });

  it("never includes the API key value or query string in a thrown message", () => {
    try {
      parseGoogleTranslateHttpResult(401, { error: { errors: [] } });
      expect.unreachable("should have thrown");
    } catch (error) {
      const message = (error as Error).message;
      expect(message).not.toContain("AIza");
      expect(message).not.toContain("key=");
    }
  });
});

describe("zipResults", () => {
  it("zips positionally to keys and builds integrity inputs", () => {
    const entries = [entry("a", "A?"), entry("b", "B?")];
    const { values, integrityInputs } = zipResults(entries, ["A", "B"]);
    expect(values.get("a")).toBe("A");
    expect(values.get("b")).toBe("B");
    expect(integrityInputs).toEqual([
      { key: "a", sourceValue: "A?", translatedValue: "A" },
      { key: "b", sourceValue: "B?", translatedValue: "B" },
    ]);
  });

  it("rejects a length-mismatched result (fewer) as INVALID_RESPONSE", () => {
    const entries = [entry("a", "A?"), entry("b", "B?")];
    expect(() => zipResults(entries, ["only-one"])).toThrow(
      expect.objectContaining({ code: "INVALID_RESPONSE" }),
    );
  });

  it("rejects a length-mismatched result (more) as INVALID_RESPONSE", () => {
    const entries = [entry("k", "v")];
    expect(() => zipResults(entries, ["x", "y"])).toThrow(
      expect.objectContaining({ code: "INVALID_RESPONSE" }),
    );
  });
});
