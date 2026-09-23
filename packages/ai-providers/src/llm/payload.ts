import type { TranslationEntry } from "@verbatra/core";
import { type LocaleMap, resolveProviderLocale } from "../locale-map.js";
import type { PluralCategories, Tone } from "../provider.js";
import { localeNamesOf } from "./locale-names.js";
import type { TranslationsResult } from "./schema.js";

interface ItemPayload {
  readonly key: string;
  readonly value: string;
  readonly description?: string;
  readonly meaning?: string;
}

export interface DataPayloadInput {
  readonly sourceLocale: string;
  readonly targetLocale: string;
  readonly entries: readonly TranslationEntry[];
  readonly glossary?: Readonly<Record<string, string>> | undefined;
  readonly tone?: Tone | undefined;
  readonly pluralCategories?: PluralCategories | undefined;
  readonly localeMap?: LocaleMap | undefined;
}

export type TranslationItem = TranslationsResult["translations"][number];

function toItem(entry: TranslationEntry): ItemPayload {
  return {
    key: entry.key,
    value: entry.value,
    ...(entry.description !== undefined ? { description: entry.description } : {}),
    ...(entry.meaning !== undefined ? { meaning: entry.meaning } : {}),
  };
}

function languageField(
  field: "sourceLanguage" | "targetLanguage",
  locale: string,
): Record<string, unknown> {
  const names = localeNamesOf(locale);
  return names === undefined ? {} : { [field]: names };
}

export function buildDataPayload(data: DataPayloadInput): Record<string, unknown> {
  return {
    sourceLocale: resolveProviderLocale(data.sourceLocale, data.localeMap),
    targetLocale: resolveProviderLocale(data.targetLocale, data.localeMap),
    ...languageField("sourceLanguage", data.sourceLocale),
    ...languageField("targetLanguage", data.targetLocale),
    ...(data.tone !== undefined ? { tone: data.tone } : {}),
    ...(data.glossary !== undefined ? { glossary: data.glossary } : {}),
    ...(data.pluralCategories !== undefined ? { pluralCategories: data.pluralCategories } : {}),
    items: data.entries.map(toItem),
  };
}

export function dataPayloadCharacters(data: DataPayloadInput): number {
  return JSON.stringify(buildDataPayload(data)).length;
}

export function resultPayloadCharacters(translations: readonly TranslationItem[]): number {
  return JSON.stringify({
    translations: translations.map(({ key, value }) => ({ key, value })),
  }).length;
}
