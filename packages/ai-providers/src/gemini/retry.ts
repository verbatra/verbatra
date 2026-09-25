import { getErrorStatus } from "../error-classification.js";
import { ProviderError } from "../errors.js";
import type { ProviderRetry, ProviderRetryListener } from "../provider-retry.js";

export interface GeminiRetryConfig {
  readonly attempts: number;
  readonly baseDelayMs: number;
}

export const DEFAULT_GEMINI_RETRY: GeminiRetryConfig = { attempts: 3, baseDelayMs: 250 };

function isRetryableStatus(status: number | undefined): status is number {
  return status === 429 || (status !== undefined && status >= 500 && status < 600);
}

function isRetryable(error: unknown): boolean {
  return (
    isRetryableStatus(getErrorStatus(error)) ||
    (error instanceof ProviderError && error.code === "TIMEOUT")
  );
}

function retryEvent(attempt: number, delayMs: number, error: unknown): ProviderRetry {
  const status = getErrorStatus(error);
  return status === undefined ? { attempt, delayMs } : { attempt, delayMs, status };
}

function isAborted(signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true;
}

function throwAbort(signal: AbortSignal | undefined): never {
  signal?.throwIfAborted();
  throw new DOMException("This operation was aborted.", "AbortError");
}

function delay(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve) => {
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export async function withGeminiRetry<T>(
  call: () => Promise<T>,
  signal?: AbortSignal,
  config: GeminiRetryConfig = DEFAULT_GEMINI_RETRY,
  onRetry?: ProviderRetryListener,
): Promise<T> {
  let attempt = 1;
  while (true) {
    try {
      return await call();
    } catch (error) {
      if (isAborted(signal)) {
        throwAbort(signal);
      }
      if (attempt >= config.attempts || !isRetryable(error)) {
        throw error;
      }
      const delayMs = config.baseDelayMs * 2 ** (attempt - 1);
      onRetry?.(retryEvent(attempt + 1, delayMs, error));
      await delay(delayMs, signal);
      if (isAborted(signal)) {
        throwAbort(signal);
      }
      attempt += 1;
    }
  }
}
