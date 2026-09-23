import type { TranslationEntry } from "@verbatra/core";
import type { LocaleGlossary } from "../glossary.js";
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
  readonly glossary?: LocaleGlossary | undefined;
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

interface TermContext {
  readonly note?: string;
  readonly partOfSpeech?: string;
}

function nonEmpty<T>(
  field: string,
  entries: readonly (readonly [string, T])[],
): Record<string, unknown> {
  return entries.length > 0 ? { [field]: Object.fromEntries(entries) } : {};
}

function termContext(note: string | undefined, partOfSpeech: string | undefined): TermContext {
  return {
    ...(note !== undefined ? { note } : {}),
    ...(partOfSpeech !== undefined ? { partOfSpeech } : {}),
  };
}

function glossaryFields(glossary: LocaleGlossary | undefined): Record<string, unknown> {
  if (glossary === undefined) {
    return {};
  }
  const terms = glossary.terms;
  return {
    ...nonEmpty(
      "glossary",
      terms.flatMap(({ source, target }) =>
        target !== undefined ? [[source, target] as const] : [],
      ),
    ),
    ...nonEmpty(
      "forbiddenTranslations",
      terms.flatMap(({ source, forbidden }) =>
        forbidden.length > 0 ? [[source, forbidden] as const] : [],
      ),
    ),
    ...nonEmpty(
      "glossaryNotes",
      terms.flatMap(({ source, note, partOfSpeech }) =>
        note !== undefined || partOfSpeech !== undefined
          ? [[source, termContext(note, partOfSpeech)] as const]
          : [],
      ),
    ),
    ...(glossary.doNotTranslate.length > 0
      ? { doNotTranslate: glossary.doNotTranslate.map(({ term }) => term) }
      : {}),
  };
}

export function buildDataPayload(data: DataPayloadInput): Record<string, unknown> {
  return {
    sourceLocale: resolveProviderLocale(data.sourceLocale, data.localeMap),
    targetLocale: resolveProviderLocale(data.targetLocale, data.localeMap),
    ...languageField("sourceLanguage", data.sourceLocale),
    ...languageField("targetLanguage", data.targetLocale),
    ...(data.tone !== undefined ? { tone: data.tone } : {}),
    ...glossaryFields(data.glossary),
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
