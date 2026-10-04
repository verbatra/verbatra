import { SdkError } from "../errors.js";
import type { LocaleSummary, SdkNotice } from "./summary.js";

export function isCancelled(signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true;
}

export function signalField(signal: AbortSignal | undefined): { readonly signal?: AbortSignal } {
  return signal === undefined ? {} : { signal };
}

export function cancelledError(message: string): SdkError {
  return new SdkError("RUN_CANCELLED", message);
}

export function unstartedLocaleError(): SdkError {
  return cancelledError(
    "The run was cancelled before this locale started, so nothing was sent or written for it.",
  );
}

export function lockWaitCancelledError(path: string): SdkError {
  return cancelledError(
    `The run was cancelled while waiting for the write lock at ${path}, so nothing was sent or ` +
      "written under it.",
  );
}

function cancelledNotice(count: number): SdkNotice {
  const keys = count === 1 ? "1 key was" : `${count} keys were`;
  return {
    code: "RUN_CANCELLED",
    message:
      `The run was cancelled while this locale was running: ${keys} not translated and stay ` +
      "pending for the next run. Translations that arrived before the cancellation were written " +
      "and recorded.",
  };
}

export function withCancelledKeys(
  summary: LocaleSummary,
  cancelled: readonly string[],
): LocaleSummary {
  if (cancelled.length === 0) {
    return summary;
  }
  return {
    ...summary,
    status: "partial",
    notices: [...summary.notices, cancelledNotice(cancelled.length)],
  };
}

export async function unlessCancelled<T>(
  signal: AbortSignal | undefined,
  message: string,
  run: () => Promise<T>,
): Promise<T> {
  if (isCancelled(signal)) {
    throw cancelledError(message);
  }
  try {
    return await run();
  } catch (error) {
    if (isCancelled(signal)) {
      throw cancelledError(message);
    }
    throw error;
  }
}
