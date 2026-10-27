import type { FetchLike } from "./network/guarded-fetch.js";

/** One provider-side retry of a request that failed with a retryable status. */
export interface ProviderRetry {
  /** The 1-based attempt about to be made: `2` for the first retry. */
  readonly attempt: number;
  /** How long the provider waits before this attempt, in milliseconds, when it is known. */
  readonly delayMs?: number;
  /** The HTTP status of the failed attempt that caused the retry, when it is known. */
  readonly status?: number;
}

/** Called for each {@link ProviderRetry} a provider makes. */
export type ProviderRetryListener = (retry: ProviderRetry) => void;

const STAINLESS_RETRY_COUNT_HEADER = "x-stainless-retry-count";

function headerValue(input: string | URL | Request, init: RequestInit | undefined): string | null {
  const fromInit =
    init?.headers === undefined
      ? null
      : new Headers(init.headers).get(STAINLESS_RETRY_COUNT_HEADER);
  if (fromInit !== null) {
    return fromInit;
  }
  return input instanceof Request ? input.headers.get(STAINLESS_RETRY_COUNT_HEADER) : null;
}

function retryCount(input: string | URL | Request, init: RequestInit | undefined): number {
  const parsed = Number.parseInt(headerValue(input, init) ?? "", 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 0;
}

export function observeSdkRetries(fetch: FetchLike, onRetry: ProviderRetryListener): FetchLike {
  return (input, init) => {
    const count = retryCount(input, init);
    if (count > 0) {
      onRetry({ attempt: count + 1 });
    }
    return fetch(input, init);
  };
}
