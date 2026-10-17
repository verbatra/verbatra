import { redact } from "@verbatra/sdk";

const CONTROL_CHARACTERS = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu;

export function causeText(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

export function studioErrorLine(detail: string): string {
  return redact(`studio error: ${detail}`).replace(CONTROL_CHARACTERS, " ");
}
