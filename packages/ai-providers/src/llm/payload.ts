import type { TranslationEntry } from "@verbatra/core";
import type { Tone } from "../provider.js";
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

export function buildDataPayload(data: DataPayloadInput): Record<string, unknown> {
  return {
    sourceLocale: data.sourceLocale,
    targetLocale: data.targetLocale,
    ...(data.tone !== undefined ? { tone: data.tone } : {}),
    ...(data.glossary !== undefined ? { glossary: data.glossary } : {}),
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
