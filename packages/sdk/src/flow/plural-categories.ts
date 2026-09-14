import type { LocaleResource, TranslationEntry } from "@verbatra/core";
import {
  type I18nextPluralCategory,
  makePluralKey,
  pluralBaseKey,
  pluralCategoryOf,
} from "@verbatra/format-adapters";
import type { SdkNotice } from "./summary.js";

export type CldrPluralCategory = I18nextPluralCategory;

const LANGUAGE_CATEGORIES: Readonly<Record<string, readonly CldrPluralCategory[]>> = {
  ar: ["zero", "one", "two", "few", "many", "other"],
  cy: ["zero", "one", "two", "few", "many", "other"],
  ga: ["one", "two", "few", "many", "other"],
  pl: ["one", "few", "many", "other"],
  ru: ["one", "few", "many", "other"],
  uk: ["one", "few", "many", "other"],
  be: ["one", "few", "many", "other"],
  lt: ["one", "few", "many", "other"],
  sl: ["one", "two", "few", "other"],
};

function isKnownRicherLanguage(locale: string): boolean {
  const subtag = locale.toLowerCase().split(/[-_]/)[0] ?? "";
  return LANGUAGE_CATEGORIES[subtag] !== undefined;
}

function requiredCategories(locale: string): readonly CldrPluralCategory[] {
  const subtag = locale.toLowerCase().split(/[-_]/)[0] ?? "";
  return LANGUAGE_CATEGORIES[subtag] ?? ["one", "other"];
}

function groupPluralSources(
  source: LocaleResource,
): Map<string, Map<CldrPluralCategory, TranslationEntry>> {
  const groups = new Map<string, Map<CldrPluralCategory, TranslationEntry>>();
  for (const [key, entry] of source.entries) {
    const baseKey = pluralBaseKey(key);
    const category = pluralCategoryOf(key);
    if (baseKey === undefined || category === undefined) {
      continue;
    }
    const group = groups.get(baseKey) ?? new Map<CldrPluralCategory, TranslationEntry>();
    group.set(category, entry);
    groups.set(baseKey, group);
  }
  return groups;
}

function suppliedCategories(
  groups: ReadonlyMap<string, ReadonlyMap<CldrPluralCategory, TranslationEntry>>,
): Set<CldrPluralCategory> {
  const supplied = new Set<CldrPluralCategory>();
  for (const group of groups.values()) {
    for (const category of group.keys()) {
      supplied.add(category);
    }
  }
  return supplied;
}

export function detectMissingPluralCategories(
  source: LocaleResource,
  targetLocale: string,
  format: string,
): SdkNotice | undefined {
  if (format !== "i18next-json") {
    return undefined;
  }
  const groups = groupPluralSources(source);
  const supplied = suppliedCategories(groups);
  if (supplied.size === 0) {
    return undefined;
  }
  const missing = requiredCategories(targetLocale).filter((category) => !supplied.has(category));
  if (missing.length === 0) {
    return undefined;
  }
  return {
    code: "PLURAL_CATEGORIES_INCOMPLETE",
    message:
      `The source does not supply all CLDR plural categories the target language "${targetLocale}" ` +
      `requires (missing: ${missing.join(", ")}); verbatra translates only the source's plural forms ` +
      "and does not synthesize the others. Add the missing forms manually.",
  };
}

export function targetPluralSetIncomplete(
  targetKeys: Iterable<string>,
  targetLocale: string,
): boolean {
  const required = requiredCategories(targetLocale);
  const present = new Map<string, Set<CldrPluralCategory>>();
  for (const key of targetKeys) {
    const baseKey = pluralBaseKey(key);
    const category = pluralCategoryOf(key);
    if (baseKey === undefined || category === undefined) {
      continue;
    }
    const set = present.get(baseKey) ?? new Set<CldrPluralCategory>();
    set.add(category);
    present.set(baseKey, set);
  }
  for (const categories of present.values()) {
    if (required.some((category) => !categories.has(category))) {
      return true;
    }
  }
  return false;
}

export function sourcePluralBaseKeys(source: LocaleResource): ReadonlySet<string> {
  const bases = new Set<string>();
  for (const key of source.entries.keys()) {
    const baseKey = pluralBaseKey(key);
    if (baseKey !== undefined) {
      bases.add(baseKey);
    }
  }
  return bases;
}

export function isGeneratedPluralKey(key: string, sourceBaseKeys: ReadonlySet<string>): boolean {
  const baseKey = pluralBaseKey(key);
  return baseKey !== undefined && sourceBaseKeys.has(baseKey);
}

export function pluralIncompleteNotice(targetLocale: string): SdkNotice {
  return {
    code: "PLURAL_CATEGORIES_INCOMPLETE",
    message:
      `The plural set for the target language "${targetLocale}" is still incomplete: verbatra could not ` +
      "generate every required CLDR plural form (an unsupported case, or a generated form was withheld " +
      "for a placeholder mismatch). Add the remaining forms manually.",
  };
}

export interface PluralGenerationItem {
  readonly targetKey: string;
  readonly category: CldrPluralCategory;
  readonly sourceEntry: TranslationEntry;
  readonly governingEntries: readonly TranslationEntry[];
}

export interface PluralGenerationPlan {
  readonly items: readonly PluralGenerationItem[];
}

function representativeEntry(
  group: ReadonlyMap<CldrPluralCategory, TranslationEntry>,
): TranslationEntry | undefined {
  return group.get("other") ?? group.get("one") ?? [...group.values()][0];
}

export function syntheticEntry(item: PluralGenerationItem): TranslationEntry {
  return {
    ...item.sourceEntry,
    key: item.targetKey,
    isPlural: true,
    meaning: `CLDR plural category "${item.category}"`,
  };
}

export function planPluralGeneration(
  source: LocaleResource,
  targetLocale: string,
  format: string,
): PluralGenerationPlan {
  if (format !== "i18next-json" || !isKnownRicherLanguage(targetLocale)) {
    return { items: [] };
  }
  const required = requiredCategories(targetLocale);
  const groups = groupPluralSources(source);
  const items: PluralGenerationItem[] = [];
  for (const [baseKey, group] of groups) {
    const representative = representativeEntry(group);
    if (representative === undefined) {
      continue;
    }
    const governingEntries = [...group.values()];
    for (const category of required) {
      if (group.has(category)) {
        continue;
      }
      items.push({
        targetKey: makePluralKey(baseKey, category),
        category,
        sourceEntry: representative,
        governingEntries,
      });
    }
  }
  return { items };
}
