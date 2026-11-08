import type { KeyValueContext } from "./key-value-context.js";

export const ORPHAN_LIMIT_NOTE =
  "This key is not in the source file. Studio sets limits only for keys in the source file; a limit written for it in the config or in verbatra.limits.json still applies.";

export const MAX_LIMIT = Number.MAX_SAFE_INTEGER;

const WHOLE_NUMBER = /^[0-9]+$/;

export const LIMIT_RANGE_MESSAGE = `Enter a whole number of characters from 1 to ${new Intl.NumberFormat("en-US").format(MAX_LIMIT)}, digits only.`;

export type LimitParse =
  | { readonly kind: "ok"; readonly value: number }
  | { readonly kind: "error"; readonly message: string };

export function parseLimitInput(text: string): LimitParse {
  const trimmed = text.trim();
  const value = WHOLE_NUMBER.test(trimmed) ? Number(trimmed) : Number.NaN;
  return Number.isSafeInteger(value) && value >= 1
    ? { kind: "ok", value }
    : { kind: "error", message: LIMIT_RANGE_MESSAGE };
}

type LoadedContext = Extract<KeyValueContext, { kind: "loaded" }>;

export type LimitControlView =
  | {
      readonly mode: "config" | "file";
      readonly value: number;
      readonly notice: string | undefined;
    }
  | { readonly mode: "none"; readonly value: undefined; readonly notice: string | undefined }
  | { readonly mode: "blocked"; readonly value: undefined; readonly notice: string };

export function limitControlView(
  context: Pick<LoadedContext, "maxLength" | "maxLengthSource" | "limitsNotice">,
): LimitControlView {
  const notice = context.limitsNotice?.message;
  const { maxLength, maxLengthSource: source } = context;
  if (source === "config" && maxLength !== undefined) {
    return { mode: "config", value: maxLength, notice };
  }
  if (notice !== undefined) {
    return { mode: "blocked", value: undefined, notice };
  }
  return source === "limits-file" && maxLength !== undefined
    ? { mode: "file", value: maxLength, notice }
    : { mode: "none", value: undefined, notice };
}

export function limitCountText(value: number): string {
  return `${value} ${value === 1 ? "character" : "characters"}`;
}
