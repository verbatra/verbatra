import { countTokens, multisetExcess } from "./multiset.js";
import type { PlaceholderIntegrityResult } from "./types.js";

function sameOrder(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

export function checkPlaceholders(
  source: readonly string[],
  translated: readonly string[],
): PlaceholderIntegrityResult {
  const sourceCounts = countTokens(source);
  const translatedCounts = countTokens(translated);

  const missing = multisetExcess(sourceCounts, translatedCounts);
  const extra = multisetExcess(translatedCounts, sourceCounts);
  const reordered = missing.length === 0 && extra.length === 0 && !sameOrder(source, translated);

  return {
    matches: missing.length === 0 && extra.length === 0,
    missing,
    extra,
    reordered,
  };
}
