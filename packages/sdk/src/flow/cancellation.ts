import { cancelledError, isAbandoned, isCancelled } from "../cancellation.js";
import type { SdkError } from "../errors.js";
import type { LocaleSummary, SdkNotice } from "./summary.js";

export function unstartedLocaleError(): SdkError {
  return cancelledError(
    "The run was cancelled before this locale started, so nothing was sent or written for it.",
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
    status: summary.status === "failed" ? "failed" : "partial",
    notices: [...summary.notices, cancelledNotice(cancelled.length)],
  };
}

function cutShort(summary: LocaleSummary): boolean {
  return (
    summary.error?.code === "RUN_CANCELLED" ||
    summary.notices.some((notice) => notice.code === "RUN_CANCELLED")
  );
}

export function cancelledField(
  signal: AbortSignal | undefined,
  summaries: readonly LocaleSummary[],
): { cancelled?: true } {
  return isCancelled(signal) && summaries.some(cutShort) ? { cancelled: true } : {};
}

export async function unlessCancelled<T>(
  signal: AbortSignal | undefined,
  message: string,
  run: () => Promise<T>,
): Promise<T> {
  throwIfCancelled(signal, message);
  try {
    return await run();
  } catch (error) {
    if (isAbandoned(signal, error)) {
      throw cancelledError(message);
    }
    throw error;
  }
}

export function throwIfCancelled(signal: AbortSignal | undefined, message: string): void {
  if (isCancelled(signal)) {
    throw cancelledError(message);
  }
}
