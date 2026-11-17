import { describe, expect, it } from "vitest";
import { PROVIDER_ERROR_CODES, ProviderError, type ProviderErrorCode } from "./errors.js";
import { isRetryableProviderError } from "./retryability.js";

const NEVER_RETRYABLE: readonly ProviderErrorCode[] = [
  "MISSING_API_KEY",
  "INVALID_REQUEST",
  "PROVIDER_REFUSED",
  "PROVIDER_BLOCKED",
  "AUTH_FAILED",
  "NETWORK_POLICY_VIOLATION",
];

const RETRYABLE: readonly ProviderErrorCode[] = [
  "INVALID_RESPONSE",
  "OUTPUT_TRUNCATED",
  "RATE_LIMITED",
  "TIMEOUT",
  "PROVIDER_UNAVAILABLE",
  "PROVIDER_ERROR",
];

describe("isRetryableProviderError by code", () => {
  it("covers every ProviderErrorCode exactly once", () => {
    expect([...NEVER_RETRYABLE, ...RETRYABLE].sort()).toEqual([...PROVIDER_ERROR_CODES].sort());
  });

  it.each(NEVER_RETRYABLE)("is false for %s", (code) => {
    expect(isRetryableProviderError(new ProviderError(code, "x"))).toBe(false);
  });

  it.each(RETRYABLE)("is true for %s without a status", (code) => {
    expect(isRetryableProviderError(new ProviderError(code, "x"))).toBe(true);
  });
});

describe("isRetryableProviderError by status on PROVIDER_ERROR", () => {
  it.each([400, 404, 405, 409, 413, 422, 456, 499])("is false for a %i", (status) => {
    expect(isRetryableProviderError(new ProviderError("PROVIDER_ERROR", "x", { status }))).toBe(
      false,
    );
  });

  it.each([399, 408, 429, 500, 503, 599])("is true for a %i", (status) => {
    expect(isRetryableProviderError(new ProviderError("PROVIDER_ERROR", "x", { status }))).toBe(
      true,
    );
  });

  it.each(["RATE_LIMITED", "TIMEOUT"] as const)("ignores a 4xx status on %s", (code) => {
    expect(isRetryableProviderError(new ProviderError(code, "x", { status: 429 }))).toBe(true);
  });
});
