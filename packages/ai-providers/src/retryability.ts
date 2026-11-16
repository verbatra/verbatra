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

function isClientErrorStatus(status: number | undefined): boolean {
  return (
    status !== undefined && status >= CLIENT_ERROR_MIN_STATUS && status <= CLIENT_ERROR_MAX_STATUS
  );
}

export function isRetryableProviderError(error: ProviderError): boolean {
  if (NEVER_RETRYABLE_CODES.has(error.code)) {
    return false;
  }
  return !(error.code === "PROVIDER_ERROR" && isClientErrorStatus(error.status));
}
