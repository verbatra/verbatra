import type { ProviderError, ProviderErrorCode } from "./errors.js";

const NEVER_RETRYABLE_CODES: ReadonlySet<ProviderErrorCode> = new Set([
  "MISSING_API_KEY",
  "INVALID_REQUEST",
  "PROVIDER_REFUSED",
  "PROVIDER_BLOCKED",
  "AUTH_FAILED",
  "NETWORK_POLICY_VIOLATION",
]);

const CLIENT_ERROR_MIN_STATUS = 400;
const CLIENT_ERROR_MAX_STATUS = 499;

const rejectedByClientError = new WeakSet<ProviderError>();

export function markClientErrorRejection(error: ProviderError, status: number): ProviderError {
  if (
    error.code === "PROVIDER_ERROR" &&
    status >= CLIENT_ERROR_MIN_STATUS &&
    status <= CLIENT_ERROR_MAX_STATUS
  ) {
    rejectedByClientError.add(error);
  }
  return error;
}

export function isRetryableProviderError(error: ProviderError): boolean {
  return !NEVER_RETRYABLE_CODES.has(error.code) && !rejectedByClientError.has(error);
}
