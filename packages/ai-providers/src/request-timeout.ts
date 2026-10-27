import { ProviderError } from "./errors.js";
import { guardProviderCall, type ProviderCallContext } from "./guard.js";

export const DEFAULT_REQUEST_TIMEOUT_MS = 120_000;

export function requestTimedOutMessage(timeoutMs: number): string {
  return `The translation provider request exceeded the ${timeoutMs} ms request timeout.`;
}

export interface SdkAttemptOptions {
  readonly signal?: AbortSignal;
  readonly timeout: number;
}

function combineSignals(caller: AbortSignal | undefined, timeout: AbortSignal): AbortSignal {
  return caller === undefined ? timeout : AbortSignal.any([caller, timeout]);
}

function renameTimeout(error: unknown, timeoutMs: number): unknown {
  return error instanceof ProviderError && error.code === "TIMEOUT"
    ? new ProviderError("TIMEOUT", requestTimedOutMessage(timeoutMs))
    : error;
}

export async function raceAttemptTimeout<T>(
  timeoutMs: number,
  callerSignal: AbortSignal | undefined,
  call: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const timeoutController = new AbortController();
  const signal = combineSignals(callerSignal, timeoutController.signal);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new ProviderError("TIMEOUT", requestTimedOutMessage(timeoutMs)));
      timeoutController.abort();
    }, timeoutMs);
  });
  try {
    return await Promise.race([call(signal), timedOut]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

export function withRequestTimeout<T>(
  timeoutMs: number,
  callerSignal: AbortSignal | undefined,
  call: (signal: AbortSignal) => Promise<T>,
  context?: ProviderCallContext,
): Promise<T> {
  return guardProviderCall(
    () => raceAttemptTimeout(timeoutMs, callerSignal, call),
    callerSignal,
    context,
  );
}

export async function withSdkAttemptTimeout<T>(
  timeoutMs: number,
  callerSignal: AbortSignal | undefined,
  call: (options: SdkAttemptOptions) => Promise<T>,
  context?: ProviderCallContext,
): Promise<T> {
  const options: SdkAttemptOptions =
    callerSignal === undefined
      ? { timeout: timeoutMs }
      : { signal: callerSignal, timeout: timeoutMs };
  try {
    return await guardProviderCall(() => call(options), callerSignal, context);
  } catch (error) {
    throw renameTimeout(error, timeoutMs);
  }
}
