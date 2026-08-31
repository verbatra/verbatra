import type { TranslationEntry } from "@verbatra/core";
import { type I18nextPluralCategory, makePluralKey } from "../i18next/plural.js";
import {
  entryObjectOf,
  localizationsOf,
  localizationValueOf,
  shouldTranslate,
  type XcstringsDocument,
} from "./xcstrings-document.js";

export interface XcstringsReadResult {
  readonly entries: Map<string, TranslationEntry>;
  readonly excludedLeafPaths: readonly string[];
}

function plainEntry(
  key: string,
  namespace: string,
  value: string,
  extractPlaceholders: (value: string) => readonly string[],
): TranslationEntry {
  return { key, namespace, value, placeholders: extractPlaceholders(value), isPlural: false };
}

function pluralEntry(
  baseKey: string,
  category: I18nextPluralCategory,
  namespace: string,
  value: string,
  extractPlaceholders: (value: string) => readonly string[],
): readonly [string, TranslationEntry] {
  const key = makePluralKey(baseKey, category);
  return [key, { key, namespace, value, placeholders: extractPlaceholders(value), isPlural: true }];
}

function addPresentEntry(
  out: Map<string, TranslationEntry>,
  loc: unknown,
  key: string,
  namespace: string,
  locale: string,
  filePath: string,
  extractPlaceholders: (value: string) => readonly string[],
): void {
  const content = localizationValueOf(loc, filePath, key, locale);
  if (content.kind === "plain") {
    out.set(key, plainEntry(key, namespace, content.value, extractPlaceholders));
    return;
  }
  for (const [category, value] of content.categories) {
    const [pluralKey, entry] = pluralEntry(key, category, namespace, value, extractPlaceholders);
    out.set(pluralKey, entry);
  }
}

export function readXcstringsLocale(
  doc: XcstringsDocument,
  locale: string,
  namespace: string,
  filePath: string,
  extractPlaceholders: (value: string) => readonly string[],
): XcstringsReadResult {
  const entries = new Map<string, TranslationEntry>();
  const excludedLeafPaths: string[] = [];

  for (const [key, rawEntry] of Object.entries(doc.strings)) {
    const entryObject = entryObjectOf(rawEntry, filePath, key);
    if (!shouldTranslate(entryObject)) {
      excludedLeafPaths.push(key);
      continue;
    }
    const localizations = localizationsOf(entryObject, filePath, key);
    const loc = localizations[locale];
    if (loc === undefined) {
      if (locale === doc.sourceLanguage) {
        entries.set(key, plainEntry(key, namespace, key, extractPlaceholders));
      }
      continue;
    }
    addPresentEntry(entries, loc, key, namespace, locale, filePath, extractPlaceholders);
  }

  return { entries, excludedLeafPaths };
}
