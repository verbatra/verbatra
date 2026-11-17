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

const RETRYABLE_CLIENT_ERROR_STATUSES: ReadonlySet<number> = new Set([408, 429]);

function isRejectedRequestStatus(status: number | undefined): boolean {
  return (
    status !== undefined &&
    status >= CLIENT_ERROR_MIN_STATUS &&
    status <= CLIENT_ERROR_MAX_STATUS &&
    !RETRYABLE_CLIENT_ERROR_STATUSES.has(status)
  );
}

export function isRetryableProviderError(error: ProviderError): boolean {
  if (NEVER_RETRYABLE_CODES.has(error.code)) {
    return false;
  }
  return !(error.code === "PROVIDER_ERROR" && isRejectedRequestStatus(error.status));
}
