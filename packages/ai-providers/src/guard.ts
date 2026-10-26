import {
  type ClassifiedProviderErrorCode,
  classifyProviderError,
  getErrorStatus,
  isAbortError,
} from "./error-classification.js";
import { ProviderError } from "./errors.js";
import {
  type EndpointRemedies,
  httpFailureMessage,
  LEAD_BY_CODE,
  requestFailedLead,
  vendorErrorTypeOf,
} from "./http-failure-message.js";
import { findNetworkPolicyViolation } from "./network/guarded-fetch.js";
import { describeNetworkCause, findNetworkCause } from "./network-cause.js";

export const PROVIDER_CALL_FAILED_MESSAGE = `${LEAD_BY_CODE.PROVIDER_ERROR}.`;
export const TIMEOUT_MESSAGE = `${LEAD_BY_CODE.TIMEOUT}.`;

export interface ProviderCallContext {
  readonly endpointHost?: string;
  readonly remedies?: EndpointRemedies;
}

function providerErrorMessage(error: unknown, endpointHost: string | undefined): string {
  const cause = findNetworkCause(error);
  const why = cause === undefined ? "." : `: ${describeNetworkCause(cause)}`;
  return `${requestFailedLead(endpointHost)}${why}`;
}

function messageFor(
  code: ClassifiedProviderErrorCode,
  error: unknown,
  context: ProviderCallContext | undefined,
): string {
  const status = getErrorStatus(error);
  if (status !== undefined) {
    const failure = { status, vendorType: vendorErrorTypeOf(error) };
    return httpFailureMessage(code, failure, {
      host: context?.endpointHost,
      remedies: context?.remedies,
    });
  }
  return code === "PROVIDER_ERROR"
    ? providerErrorMessage(error, context?.endpointHost)
    : `${LEAD_BY_CODE[code]}.`;
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
