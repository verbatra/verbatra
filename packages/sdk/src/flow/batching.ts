import { ProviderError } from "@verbatra/ai-providers";
import type { SdkNotice } from "./summary.js";

export function chunk<T>(items: readonly T[], size: number): readonly (readonly T[])[] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

const GENERIC_PROVIDER_FAILURE_MESSAGE = "The provider call failed.";

function classifyProviderFailure(error: unknown): {
  readonly code: string;
  readonly message: string;
} {
  if (error instanceof ProviderError) {
    return { code: error.code, message: error.message };
  }
  return { code: "PROVIDER_CALL_FAILED", message: GENERIC_PROVIDER_FAILURE_MESSAGE };
}

export function subBatchFailedNotice(count: number, error: unknown): SdkNotice {
  const { code, message } = classifyProviderFailure(error);
  return {
    code: "SUB_BATCH_FAILED",
    message: `A sub-batch of ${count} ${count === 1 ? "entry" : "entries"} failed (${code}: ${message}) and was withheld; it will be retried next run.`,
  };
}
