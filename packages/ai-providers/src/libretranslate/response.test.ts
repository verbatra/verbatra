import { describe, expect, it } from "vitest";
import { ProviderError } from "../errors.js";
import {
  AUTH_FAILED_MESSAGE,
  INVALID_REQUEST_MESSAGE,
  LANGUAGE_UNAVAILABLE_MESSAGE,
  LIMIT_EXCEEDED_MESSAGE,
  NOT_FOUND_MESSAGE,
  parseLibreTranslateHttpResult,
  RATE_LIMITED_MESSAGE,
} from "./response.js";

function failure(status: number, body: unknown, keyConfigured = false): ProviderError {
  try {
    parseLibreTranslateHttpResult(status, body, keyConfigured);
  } catch (error) {
    if (error instanceof ProviderError) {
      return error;
    }
  }
  throw new Error("expected a ProviderError");
}

describe("parseLibreTranslateHttpResult: success", () => {
  it("returns the batch of translated texts", () => {
    expect(parseLibreTranslateHttpResult(200, { translatedText: ["a", "b"] }, false)).toEqual([
      "a",
      "b",
    ]);
  });

  it("fails INVALID_RESPONSE for a single string or a malformed body", () => {
    expect(failure(200, { translatedText: "a" }).code).toBe("INVALID_RESPONSE");
    expect(failure(200, undefined).code).toBe("INVALID_RESPONSE");
  });
});

describe("parseLibreTranslateHttpResult: errors", () => {
  it.each([
    [
      400,
      "Please contact the server operator to get an API key",
      true,
      "AUTH_FAILED",
      AUTH_FAILED_MESSAGE,
    ],
    [400, "de is not supported", false, "INVALID_REQUEST", LANGUAGE_UNAVAILABLE_MESSAGE],
    [
      400,
      "German (de) is not available as a target language from English (en)",
      false,
      "INVALID_REQUEST",
      LANGUAGE_UNAVAILABLE_MESSAGE,
    ],
    [
      400,
      "Invalid request: request (30) exceeds text limit (25)",
      false,
      "INVALID_REQUEST",
      LIMIT_EXCEEDED_MESSAGE,
    ],
    [
      400,
      "Invalid request: missing q parameter",
      false,
      "INVALID_REQUEST",
      INVALID_REQUEST_MESSAGE,
    ],
    [401, "", false, "AUTH_FAILED", AUTH_FAILED_MESSAGE],
    [403, "Invalid API key", true, "AUTH_FAILED", AUTH_FAILED_MESSAGE],
    [403, "Too many request limits violations", false, "RATE_LIMITED", RATE_LIMITED_MESSAGE],
    [404, "", false, "PROVIDER_ERROR", NOT_FOUND_MESSAGE],
    [429, "Slowdown: 20 per 1 minute", false, "RATE_LIMITED", RATE_LIMITED_MESSAGE],
  ] as const)(
    "maps HTTP %i %j to a structured error",
    (status, text, keyConfigured, code, message) => {
      const error = failure(status, { error: text }, keyConfigured);
      expect(error.code).toBe(code);
      expect(error.message).toBe(message);
    },
  );

  it("maps a key demand without a configured key to MISSING_API_KEY naming the variable", () => {
    const error = failure(400, { error: "Visit https://portal.example to get an API key" }, false);
    expect(error.code).toBe("MISSING_API_KEY");
    expect(error.envVar).toBe("LIBRETRANSLATE_API_KEY");
    expect(error.message).not.toContain("portal.example");
  });

  it("maps a server error to PROVIDER_UNAVAILABLE and any other status to PROVIDER_ERROR", () => {
    expect(failure(500, { error: "Cannot translate text: boom" }).code).toBe(
      "PROVIDER_UNAVAILABLE",
    );
    expect(failure(503, undefined).code).toBe("PROVIDER_UNAVAILABLE");
    expect(failure(418, undefined).code).toBe("PROVIDER_ERROR");
  });

  it("never echoes the server's own error text", () => {
    const error = failure(500, { error: "Cannot translate text: secret-value-123" });
    expect(error.message).not.toContain("secret-value-123");
  });
});
