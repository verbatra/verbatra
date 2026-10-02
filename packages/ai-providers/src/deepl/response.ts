import { ProviderError } from "../errors.js";
import type { DeepLTextResult } from "./types.js";

const MISMATCH_MESSAGE = "The provider returned a mismatched number of translations.";

export function zipResults<T>(
  items: readonly T[],
  results: readonly DeepLTextResult[],
): ReadonlyArray<readonly [T, string]> {
  const pairs: Array<readonly [T, string]> = [];
  const resultIter = results[Symbol.iterator]();
  for (const item of items) {
    const next = resultIter.next();
    if (next.done === true) {
      throw new ProviderError("INVALID_RESPONSE", MISMATCH_MESSAGE);
    }
    pairs.push([item, next.value.text]);
  }
  if (resultIter.next().done === false) {
    throw new ProviderError("INVALID_RESPONSE", MISMATCH_MESSAGE);
  }
  return pairs;
}
