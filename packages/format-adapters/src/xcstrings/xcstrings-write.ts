import type { LocaleResource, TranslationEntry } from "@verbatra/core";
import { type I18nextPluralCategory, pluralBaseKey, pluralCategoryOf } from "../i18next/plural.js";
import {
  entryObjectOf,
  localizationsOf,
  shouldTranslate,
  type XcstringsDocument,
  type XcstringsRecord,
} from "./xcstrings-document.js";

interface Touched {
  readonly singular: ReadonlyMap<string, string>;
  readonly plural: ReadonlyMap<string, ReadonlyMap<I18nextPluralCategory, string>>;
}

function groupByKey(entries: ReadonlyMap<string, TranslationEntry>): Touched {
  const singular = new Map<string, string>();
  const plural = new Map<string, Map<I18nextPluralCategory, string>>();
  for (const [key, entry] of entries) {
    const baseKey = entry.isPlural ? pluralBaseKey(key) : undefined;
    const category = entry.isPlural ? pluralCategoryOf(key) : undefined;
    if (baseKey !== undefined && category !== undefined) {
      const group = plural.get(baseKey) ?? new Map<I18nextPluralCategory, string>();
      group.set(category, entry.value);
      plural.set(baseKey, group);
    } else {
      singular.set(key, entry.value);
    }
  }
  return { singular, plural };
}

function currentPlainValue(loc: unknown): string | undefined {
  if (typeof loc !== "object" || loc === null) {
    return undefined;
  }
  const stringUnit = (loc as XcstringsRecord).stringUnit;
  if (typeof stringUnit !== "object" || stringUnit === null) {
    return undefined;
  }
  const value = (stringUnit as XcstringsRecord).value;
  return typeof value === "string" ? value : undefined;
}

function currentPluralValues(loc: unknown): ReadonlyMap<string, string> | undefined {
  if (typeof loc !== "object" || loc === null) {
    return undefined;
  }
  const variations = (loc as XcstringsRecord).variations;
  if (typeof variations !== "object" || variations === null) {
    return undefined;
  }
  const plural = (variations as XcstringsRecord).plural;
  if (typeof plural !== "object" || plural === null) {
    return undefined;
  }
  const out = new Map<string, string>();
  for (const [category, variation] of Object.entries(plural)) {
    const value = currentPlainValue(variation);
    if (value === undefined) {
      return undefined;
    }
    out.set(category, value);
  }
  return out;
}

function pluralValuesEqual(
  current: ReadonlyMap<string, string> | undefined,
  wanted: ReadonlyMap<I18nextPluralCategory, string>,
): boolean {
  if (current === undefined || current.size !== wanted.size) {
    return false;
  }
  for (const [category, value] of wanted) {
    if (current.get(category) !== value) {
      return false;
    }
  }
  return true;
}

function buildPluralLocalization(
  categories: ReadonlyMap<I18nextPluralCategory, string>,
): XcstringsRecord {
  const plural: XcstringsRecord = {};
  for (const [category, value] of categories) {
    plural[category] = { stringUnit: { state: "translated", value } };
  }
  return { variations: { plural } };
}

function buildPlainLocalization(value: string): XcstringsRecord {
  return { stringUnit: { state: "translated", value } };
}

function deleteLocalization(entry: XcstringsRecord, locale: string): void {
  const localizations = entry.localizations;
  if (typeof localizations !== "object" || localizations === null) {
    return;
  }
  delete (localizations as XcstringsRecord)[locale];
}

function writeLocalization(
  entry: XcstringsRecord,
  locale: string,
  filePath: string,
  key: string,
  content: XcstringsRecord,
): void {
  const localizations = localizationsOf(entry, filePath, key);
  if (entry.localizations === undefined) {
    entry.localizations = localizations;
  }
  localizations[locale] = content;
}

function patchKey(
  entry: XcstringsRecord,
  key: string,
  locale: string,
  filePath: string,
  touched: Touched,
): void {
  const loc = localizationsOf(entry, filePath, key)[locale];
  const singularValue = touched.singular.get(key);
  if (singularValue !== undefined) {
    const isPlural = currentPluralValues(loc) !== undefined;
    const currentValue = isPlural ? undefined : (currentPlainValue(loc) ?? "");
    if (currentValue === singularValue) {
      return;
    }
    writeLocalization(entry, locale, filePath, key, buildPlainLocalization(singularValue));
    return;
  }
  const pluralCategories = touched.plural.get(key);
  if (pluralCategories !== undefined) {
    if (pluralValuesEqual(currentPluralValues(loc), pluralCategories)) {
      return;
    }
    writeLocalization(entry, locale, filePath, key, buildPluralLocalization(pluralCategories));
    return;
  }
  deleteLocalization(entry, locale);
}

export function patchXcstringsDocument(
  doc: XcstringsDocument,
  locale: string,
  resource: LocaleResource,
  filePath: string,
): void {
  const touched = groupByKey(resource.entries);
  for (const [key, rawEntry] of Object.entries(doc.strings)) {
    const entry = entryObjectOf(rawEntry, filePath, key);
    if (!shouldTranslate(entry)) {
      continue;
    }
    patchKey(entry, key, locale, filePath, touched);
  }
}
