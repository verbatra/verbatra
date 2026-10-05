import type { SdkNotice } from "./summary.js";

const LISTED_KEYS = 5;

export function emptySourceNotice(keys: readonly string[]): SdkNotice | undefined {
  if (keys.length === 0) {
    return undefined;
  }
  const shown = keys.slice(0, LISTED_KEYS).map((key) => JSON.stringify(key));
  const more = keys.length > shown.length ? `, and ${keys.length - shown.length} more` : "";
  const count = keys.length === 1 ? "1 key has" : `${keys.length} keys have`;
  return {
    code: "SOURCE_VALUE_EMPTY",
    message:
      `${count} an empty source value, so nothing is translated for ${keys.length === 1 ? "it" : "them"}: ` +
      `${shown.join(", ")}${more}. Write the source text, then run verbatra translate again.`,
  };
}
