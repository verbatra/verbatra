import { AdapterError } from "../errors.js";
import type { I18nextPluralCategory } from "../i18next/plural.js";

export const PLURAL_CATEGORIES: readonly I18nextPluralCategory[] = [
  "zero",
  "one",
  "two",
  "few",
  "many",
  "other",
];

const PLURAL_CATEGORY_SET = new Set<string>(PLURAL_CATEGORIES);

export type XcstringsRecord = Record<string, unknown>;

export interface XcstringsDocument {
  readonly raw: XcstringsRecord;
  readonly sourceLanguage: string;
  readonly strings: XcstringsRecord;
}

function isRecord(value: unknown): value is XcstringsRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseXcstringsDocument(content: string, filePath: string): XcstringsDocument {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new AdapterError("INVALID_JSON", `${filePath} is not valid JSON.`);
  }
  if (!isRecord(parsed)) {
    throw new AdapterError(
      "INVALID_STRUCTURE",
      `${filePath}: the top level of an .xcstrings catalogue must be a JSON object.`,
    );
  }
  const sourceLanguage = parsed.sourceLanguage;
  if (typeof sourceLanguage !== "string" || sourceLanguage.length === 0) {
    throw new AdapterError(
      "INVALID_STRUCTURE",
      `${filePath}: the catalogue has no "sourceLanguage" string field.`,
    );
  }
  const strings = parsed.strings;
  if (!isRecord(strings)) {
    throw new AdapterError(
      "INVALID_STRUCTURE",
      `${filePath}: the catalogue has no "strings" object field.`,
    );
  }
  return { raw: parsed, sourceLanguage, strings };
}

export function entryObjectOf(rawEntry: unknown, filePath: string, key: string): XcstringsRecord {
  if (!isRecord(rawEntry)) {
    throw new AdapterError(
      "INVALID_STRUCTURE",
      `${filePath}: the entry "${key}" must be a JSON object.`,
    );
  }
  return rawEntry;
}

export function localizationsOf(
  entry: XcstringsRecord,
  filePath: string,
  key: string,
): XcstringsRecord {
  const localizations = entry.localizations;
  if (localizations === undefined) {
    return {};
  }
  if (!isRecord(localizations)) {
    throw new AdapterError(
      "INVALID_STRUCTURE",
      `${filePath}: the entry "${key}" has a "localizations" field that is not a JSON object.`,
    );
  }
  return localizations;
}

export function shouldTranslate(entry: XcstringsRecord): boolean {
  return entry.shouldTranslate !== false;
}

function stringUnitValueOf(stringUnit: unknown, filePath: string, where: string): string {
  if (!isRecord(stringUnit) || typeof stringUnit.value !== "string") {
    throw new AdapterError(
      "INVALID_STRUCTURE",
      `${filePath}: ${where} has a "stringUnit" without a string "value" field.`,
    );
  }
  return stringUnit.value;
}

export interface XcstringsLocalizationContent {
  readonly kind: "plain";
  readonly value: string;
}

export interface XcstringsPluralContent {
  readonly kind: "plural";
  readonly categories: ReadonlyMap<I18nextPluralCategory, string>;
}

export type XcstringsLocalizationValue = XcstringsLocalizationContent | XcstringsPluralContent;

function pluralVariationsOf(loc: XcstringsRecord): unknown {
  const variations = loc.variations;
  if (!isRecord(variations)) {
    return undefined;
  }
  return variations.plural;
}

/**
 * Reads one locale's content out of an already-fetched `localizations[locale]` entry: a plain
 * `stringUnit` value, or a `variations.plural` category map. Throws on any shape that is neither, so
 * a malformed or unsupported (device-class or width variant only) localization is reported rather
 * than silently mishandled.
 */
export function localizationValueOf(
  loc: unknown,
  filePath: string,
  key: string,
  locale: string,
): XcstringsLocalizationValue {
  if (!isRecord(loc)) {
    throw new AdapterError(
      "INVALID_STRUCTURE",
      `${filePath}: the entry "${key}"'s "${locale}" localization must be a JSON object.`,
    );
  }
  const plural = pluralVariationsOf(loc);
  if (plural !== undefined) {
    if (!isRecord(plural)) {
      throw new AdapterError(
        "INVALID_STRUCTURE",
        `${filePath}: the entry "${key}"'s "${locale}" localization has a "variations.plural" field that is not a JSON object.`,
      );
    }
    const categories = new Map<I18nextPluralCategory, string>();
    for (const [category, variation] of Object.entries(plural)) {
      if (!PLURAL_CATEGORY_SET.has(category)) {
        throw new AdapterError(
          "INVALID_STRUCTURE",
          `${filePath}: the entry "${key}"'s "${locale}" localization has an unsupported plural category "${category}"; expected one of ${PLURAL_CATEGORIES.join(", ")}.`,
        );
      }
      const value = stringUnitValueOf(
        isRecord(variation) ? variation.stringUnit : undefined,
        filePath,
        `the entry "${key}"'s "${locale}" "${category}" plural category`,
      );
      categories.set(category as I18nextPluralCategory, value);
    }
    if (categories.size === 0) {
      throw new AdapterError(
        "INVALID_STRUCTURE",
        `${filePath}: the entry "${key}"'s "${locale}" localization has a "variations.plural" object with no plural categories.`,
      );
    }
    return { kind: "plural", categories };
  }
  if (loc.stringUnit !== undefined) {
    return {
      kind: "plain",
      value: stringUnitValueOf(
        loc.stringUnit,
        filePath,
        `the entry "${key}"'s "${locale}" localization`,
      ),
    };
  }
  throw new AdapterError(
    "INVALID_STRUCTURE",
    `${filePath}: the entry "${key}"'s "${locale}" localization has neither a "stringUnit" nor a "variations.plural" field; verbatra does not support device-class or width variants without one of those as a fallback.`,
  );
}
