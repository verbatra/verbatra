import type { PluralCategories, Tone, TranslateRequest } from "@verbatra/ai-providers";
import type { TranslationEntry } from "@verbatra/core";
import type { FormatAdapter } from "@verbatra/format-adapters";
import { resolvePluralCategories } from "./plural-rules.js";

export interface TranslateRequestContext {
  readonly sourceLocale: string;
  readonly targetLocale: string;
  readonly adapter: FormatAdapter;
  readonly glossary: Readonly<Record<string, string>> | undefined;
  readonly maxLength: ReadonlyMap<string, number> | undefined;
  readonly tone: Tone | undefined;
}

function requestPluralCategories(
  context: TranslateRequestContext,
  entries: readonly TranslationEntry[],
): PluralCategories | undefined {
  if (context.adapter.compareBranchArms === undefined || !entries.some((entry) => entry.isPlural)) {
    return undefined;
  }
  const cardinal = resolvePluralCategories(context.targetLocale, "cardinal");
  if (cardinal.kind === "fallback") {
    return undefined;
  }
  return {
    cardinal: cardinal.categories,
    ordinal: resolvePluralCategories(context.targetLocale, "ordinal").categories,
  };
}

export function buildTranslateRequest(
  context: TranslateRequestContext,
  entries: readonly TranslationEntry[],
): TranslateRequest {
  const pluralCategories = requestPluralCategories(context, entries);
  return {
    sourceLocale: context.sourceLocale,
    targetLocale: context.targetLocale,
    entries,
    extractPlaceholders: context.adapter.extractPlaceholders,
    ...(context.glossary !== undefined ? { glossary: context.glossary } : {}),
    ...(context.maxLength !== undefined ? { maxLength: context.maxLength } : {}),
    ...(context.tone !== undefined ? { tone: context.tone } : {}),
    ...(pluralCategories !== undefined ? { pluralCategories } : {}),
    ...(context.adapter.comparePlaceholders !== undefined
      ? { comparePlaceholders: context.adapter.comparePlaceholders }
      : {}),
  };
}
