import type { ProviderErrorCode } from "./errors.js";

export type ClassifiedProviderErrorCode = Extract<
  ProviderErrorCode,
  "RATE_LIMITED" | "TIMEOUT" | "AUTH_FAILED" | "PROVIDER_UNAVAILABLE" | "PROVIDER_ERROR"
>;

const RATE_LIMITED_STATUS = 429;
const TIMEOUT_STATUS = 408;
const AUTH_FAILED_STATUSES: ReadonlySet<number> = new Set([401, 403]);
const SERVER_OUTAGE_MIN_STATUS = 500;
const SERVER_OUTAGE_MAX_STATUS = 599;

const RATE_LIMITED_CLASS_NAMES: ReadonlySet<string> = new Set([
  "RateLimitError",
  "TooManyRequestsError",
]);
const AUTH_FAILED_CLASS_NAMES: ReadonlySet<string> = new Set([
  "AuthenticationError",
  "PermissionDeniedError",
  "AuthorizationError",
]);
const TIMEOUT_CLASS_NAMES: ReadonlySet<string> = new Set(["APIConnectionTimeoutError"]);
const WRAPPED_CONNECTION_CLASS_NAME = "ConnectionError";
const WRAPPED_TIMEOUT_CODES: ReadonlySet<string> = new Set(["ECONNABORTED", "ETIMEDOUT"]);

const ABORT_ERROR_CLASS_NAMES: ReadonlySet<string> = new Set(["APIUserAbortError"]);

export function getErrorStatus(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null || !("status" in error)) {
    return undefined;
  }
  const status = (error as { readonly status?: unknown }).status;
  return typeof status === "number" ? status : undefined;
}

function isServerOutageStatus(status: number | undefined): boolean {
  return (
    status !== undefined && status >= SERVER_OUTAGE_MIN_STATUS && status <= SERVER_OUTAGE_MAX_STATUS
  );
}

function readClassName(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) {
    return undefined;
  }
  return error.constructor?.name;
}

function classifyByStatus(status: number | undefined): ClassifiedProviderErrorCode | undefined {
  if (status === RATE_LIMITED_STATUS) {
    return "RATE_LIMITED";
  }
  if (status !== undefined && AUTH_FAILED_STATUSES.has(status)) {
    return "AUTH_FAILED";
  }
  if (status === TIMEOUT_STATUS) {
    return "TIMEOUT";
  }
  return isServerOutageStatus(status) ? "PROVIDER_UNAVAILABLE" : undefined;
}

function classifyByClassName(error: unknown): ClassifiedProviderErrorCode | undefined {
  const className = readClassName(error);
  if (className === undefined) {
    return undefined;
  }
  if (RATE_LIMITED_CLASS_NAMES.has(className)) {
    return "RATE_LIMITED";
  }
  if (AUTH_FAILED_CLASS_NAMES.has(className)) {
    return "AUTH_FAILED";
  }
  if (TIMEOUT_CLASS_NAMES.has(className)) {
    return "TIMEOUT";
  }
  if (className === WRAPPED_CONNECTION_CLASS_NAME) {
    return isWrappedTimeout(error) ? "TIMEOUT" : "PROVIDER_ERROR";
  }
  return undefined;
}

export function classifyProviderError(error: unknown): ClassifiedProviderErrorCode {
  return classifyByStatus(getErrorStatus(error)) ?? classifyByClassName(error) ?? "PROVIDER_ERROR";
}

function wrappedCode(error: unknown): string | undefined {
  const inner = (error as { readonly error?: unknown }).error;
  if (typeof inner !== "object" || inner === null || !("code" in inner)) {
    return undefined;
  }
  const code = (inner as { readonly code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

function isWrappedTimeout(error: unknown): boolean {
  const code = wrappedCode(error);
  return code === undefined || WRAPPED_TIMEOUT_CODES.has(code);
}

function isAbortShapedError(error: unknown): boolean {
  if (error instanceof Error && error.name === "AbortError") {
    return true;
  }
  const className = readClassName(error);
  return className !== undefined && ABORT_ERROR_CLASS_NAMES.has(className);
}

export function isAbortError(error: unknown, signal: AbortSignal | undefined): boolean {
  if (signal !== undefined) {
    return signal.aborted === true && isAbortShapedError(error);
  }
  return isAbortShapedError(error);
}
