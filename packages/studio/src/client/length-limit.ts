import type { KeyValueContext } from "./key-value-context.js";

export const NO_LIMIT_FOR_UNKNOWN_KEY =
  "A key that is not in the source file has no length limit: verbatra.limits.json takes only source keys, so a generated plural form has none.";

export function limitReasonFor(error: { readonly code: string }): string | undefined {
  return error.code === "UNKNOWN_KEY" ? NO_LIMIT_FOR_UNKNOWN_KEY : undefined;
}

export const MAX_LIMIT = Number.MAX_SAFE_INTEGER;

const WHOLE_NUMBER = /^[0-9]+$/;

export type LimitParse =
  | { readonly kind: "ok"; readonly value: number }
  | { readonly kind: "error"; readonly message: string };

export function parseLimitInput(text: string): LimitParse {
  const trimmed = text.trim();
  if (trimmed === "") {
    return { kind: "error", message: "Enter a whole number of characters, 1 or more." };
  }
  if (!WHOLE_NUMBER.test(trimmed)) {
    return { kind: "error", message: "Use digits only: a whole number of characters, 1 or more." };
  }
  const value = Number(trimmed);
  if (value < 1) {
    return { kind: "error", message: "The limit must be at least 1 character." };
  }
  if (!Number.isSafeInteger(value)) {
    return { kind: "error", message: `The limit can be at most ${MAX_LIMIT} characters.` };
  }
  return { kind: "ok", value };
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

export type LimitMode = LimitControlView["mode"];

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
