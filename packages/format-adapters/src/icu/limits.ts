export const ICU_MAX_VALUE_LENGTH = 20_000;

export const ICU_MAX_NESTING_DEPTH = 16;

export const ICU_MAX_DELIMITERS = 256;

export type IcuRefusal = "too-long" | "too-complex";

export function icuRefusal(value: string): IcuRefusal | undefined {
  if (value.length > ICU_MAX_VALUE_LENGTH) {
    return "too-long";
  }
  let depth = 0;
  let delimiters = 0;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === "{") {
      depth += 1;
      delimiters += 1;
    } else if (char === "}") {
      depth = Math.max(0, depth - 1);
    } else if (char === "<") {
      delimiters += 1;
    }
    if (depth > ICU_MAX_NESTING_DEPTH || delimiters > ICU_MAX_DELIMITERS) {
      return "too-complex";
    }
  }
  return undefined;
}
