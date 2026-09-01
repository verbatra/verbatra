import type { TranslationEntry } from "@verbatra/core";

export const PLACEHOLDER_UNSUPPORTED_MESSAGE =
  "Some entries contain placeholders or ICU syntax that Google Cloud Translation cannot preserve; they were left untranslated. Use an LLM provider to translate placeholder-bearing strings.";

export interface PlaceholderPartition {
  readonly protectable: readonly TranslationEntry[];
  readonly unprotectable: readonly TranslationEntry[];
}

export function partitionByPlaceholders(
  entries: readonly TranslationEntry[],
): PlaceholderPartition {
  const protectable: TranslationEntry[] = [];
  const unprotectable: TranslationEntry[] = [];
  for (const entry of entries) {
    if (entry.placeholders.length > 0) {
      unprotectable.push(entry);
    } else {
      protectable.push(entry);
    }
  }
  return { protectable, unprotectable };
}
