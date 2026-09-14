import type { Tone, TranslateRequest } from "@verbatra/ai-providers";
import type { TranslationEntry } from "@verbatra/core";
import type { FormatAdapter } from "@verbatra/format-adapters";

export interface TranslateRequestContext {
  readonly sourceLocale: string;
  readonly targetLocale: string;
  readonly adapter: FormatAdapter;
  readonly glossary: Readonly<Record<string, string>> | undefined;
  readonly maxLength: ReadonlyMap<string, number> | undefined;
  readonly tone: Tone | undefined;
}

export function buildTranslateRequest(
  context: TranslateRequestContext,
  entries: readonly TranslationEntry[],
): TranslateRequest {
  return {
    sourceLocale: context.sourceLocale,
    targetLocale: context.targetLocale,
    entries,
    extractPlaceholders: context.adapter.extractPlaceholders,
    ...(context.glossary !== undefined ? { glossary: context.glossary } : {}),
    ...(context.maxLength !== undefined ? { maxLength: context.maxLength } : {}),
    ...(context.tone !== undefined ? { tone: context.tone } : {}),
    ...(context.adapter.comparePlaceholders !== undefined
      ? { comparePlaceholders: context.adapter.comparePlaceholders }
      : {}),
  };
}
