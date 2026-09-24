import { getErrorStatus } from "../error-classification.js";
import type { ProviderRetryListener } from "../provider-retry.js";

export interface GeminiRetryConfig {
  readonly attempts: number;
  readonly baseDelayMs: number;
}

export const DEFAULT_GEMINI_RETRY: GeminiRetryConfig = { attempts: 3, baseDelayMs: 250 };

function isRetryableStatus(status: number | undefined): status is number {
  return status === 429 || (status !== undefined && status >= 500 && status < 600);
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
      const status = getErrorStatus(error);
      const exhausted = attempt >= config.attempts;
      if (exhausted || !isRetryableStatus(status)) {
        throw error;
      }
      const delayMs = config.baseDelayMs * 2 ** (attempt - 1);
      onRetry?.({ attempt: attempt + 1, delayMs, status });
      await delay(delayMs, signal);
      if (isAborted(signal)) {
        throwAbort(signal);
      }
      attempt += 1;
    }
  }
}
