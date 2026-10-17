import { ProviderError } from "@verbatra/ai-providers";
import { SdkError } from "./errors.js";

export function isCancelled(signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true;
}

export function isAbandoned(signal: AbortSignal | undefined, error: unknown): boolean {
  return isCancelled(signal) && !(error instanceof ProviderError) && !(error instanceof SdkError);
}

export function signalField(signal: AbortSignal | undefined): { readonly signal?: AbortSignal } {
  return signal === undefined ? {} : { signal };
}

export function cancelledError(message: string): SdkError {
  return new SdkError("RUN_CANCELLED", message);
}
