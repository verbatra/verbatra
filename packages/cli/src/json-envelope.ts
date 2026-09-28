import type { WatchRunResult } from "@verbatra/sdk";
import type { RenderableError } from "./render.js";

export const JSON_ENVELOPE_VERSION = 1;

export interface SuccessEnvelope<TResult> {
  readonly ok: true;
  readonly version: number;
  readonly command: string;
  readonly result: TResult;
}

export interface ErrorEnvelope {
  readonly ok: false;
  readonly version: number;
  readonly command: string | null;
  readonly code: string;
  readonly message: string;
  readonly causeCode?: string;
  readonly candidates?: readonly string[];
  readonly missing?: readonly string[];
  readonly hint?: string;
}

export function renderSuccessEnvelope<TResult>(command: string, result: TResult): string {
  const envelope: SuccessEnvelope<TResult> = {
    ok: true,
    version: JSON_ENVELOPE_VERSION,
    command,
    result,
  };
  return JSON.stringify(envelope);
}

export function renderErrorEnvelope(command: string | null, error: RenderableError): string {
  const envelope: ErrorEnvelope = {
    ok: false,
    version: JSON_ENVELOPE_VERSION,
    command,
    code: error.code,
    message: error.message,
    ...(error.causeCode === undefined ? {} : { causeCode: error.causeCode }),
    ...(error.candidates === undefined ? {} : { candidates: error.candidates }),
    ...(error.missing === undefined ? {} : { missing: error.missing }),
    ...(error.hint === undefined ? {} : { hint: error.hint }),
  };
  return JSON.stringify(envelope);
}

export function renderRunResultEnvelope(result: WatchRunResult): string {
  return result.status === "succeeded"
    ? renderSuccessEnvelope("watch", result.summary)
    : renderErrorEnvelope("watch", result.error);
}
