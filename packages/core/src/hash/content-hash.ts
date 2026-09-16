import type { TranslationEntry } from "../model/translation-entry.js";
import { normalizeText } from "./normalize-text.js";
import { stableStringHash } from "./string-hash.js";

function canonicalize(entry: TranslationEntry): string {
  return JSON.stringify([
    normalizeText(entry.value),
    entry.description == null ? null : normalizeText(entry.description),
    entry.meaning == null ? null : normalizeText(entry.meaning),
    entry.isPlural,
    [...entry.placeholders].map(normalizeText).sort(),
  ]);
}

export function contentHash(entry: TranslationEntry): string {
  return stableStringHash(canonicalize(entry));
}
