import {
  type ClassifiedProviderErrorCode,
  classifyProviderError,
  isAbortError,
} from "./error-classification.js";
import { ProviderError } from "./errors.js";
import { findNetworkPolicyViolation } from "./network/guarded-fetch.js";
import { describeNetworkCause, findNetworkCause } from "./network-cause.js";

export const PROVIDER_CALL_FAILED_MESSAGE = "The translation provider request failed.";
export const RATE_LIMITED_MESSAGE = "The translation provider rate-limited this request.";
export const TIMEOUT_MESSAGE = "The translation provider request timed out.";
export const AUTH_FAILED_MESSAGE = "The translation provider rejected the request credentials.";
export const PROVIDER_UNAVAILABLE_MESSAGE = "The translation provider is currently unavailable.";

const MESSAGE_BY_CODE: Readonly<Record<ClassifiedProviderErrorCode, string>> = {
  RATE_LIMITED: RATE_LIMITED_MESSAGE,
  TIMEOUT: TIMEOUT_MESSAGE,
  AUTH_FAILED: AUTH_FAILED_MESSAGE,
  PROVIDER_UNAVAILABLE: PROVIDER_UNAVAILABLE_MESSAGE,
  PROVIDER_ERROR: PROVIDER_CALL_FAILED_MESSAGE,
};

/**
 * What a caller knows about the endpoint it is about to call, used only to make a transport failure
 * legible. The host is the `host` of a configured base URL, so it carries no path, query, or
 * user-info component and can never hold a credential.
 */
export interface ProviderCallContext {
  /** Host and port of the configured endpoint, for example `localhost:11434`. */
  readonly endpointHost?: string;
}

function providerErrorMessage(error: unknown, endpointHost: string | undefined): string {
  const cause = findNetworkCause(error);
  if (cause === undefined && endpointHost === undefined) {
    return PROVIDER_CALL_FAILED_MESSAGE;
  }
  const where = endpointHost === undefined ? "" : ` to ${endpointHost}`;
  const why = cause === undefined ? "" : `: ${describeNetworkCause(cause)}`;
  return `The translation provider request${where} failed${why === "" ? "." : why}`;
}

function messageFor(
  code: ClassifiedProviderErrorCode,
  error: unknown,
  context: ProviderCallContext | undefined,
): string {
  return code === "PROVIDER_ERROR"
    ? providerErrorMessage(error, context?.endpointHost)
    : MESSAGE_BY_CODE[code];
}

export async function guardProviderCall<T>(
  call: () => Promise<T>,
  signal?: AbortSignal,
  context?: ProviderCallContext,
): Promise<T> {
  signal?.throwIfAborted();
  try {
    return await call();
  } catch (error) {
    if (error instanceof ProviderError || isAbortError(error, signal)) {
      throw error;
    }
    const violation = findNetworkPolicyViolation(error);
    if (violation !== undefined) {
      throw new ProviderError("NETWORK_POLICY_VIOLATION", violation.message);
    }
    const code = classifyProviderError(error);
    throw new ProviderError(code, messageFor(code, error, context));
  }
}
