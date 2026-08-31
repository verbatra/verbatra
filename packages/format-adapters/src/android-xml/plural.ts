import type { I18nextPluralCategory } from "../i18next/plural.js";

export const ANDROID_PLURAL_CATEGORIES: readonly I18nextPluralCategory[] = [
  "zero",
  "one",
  "two",
  "few",
  "many",
  "other",
];

const ANDROID_PLURAL_CATEGORY_SET: ReadonlySet<string> = new Set(ANDROID_PLURAL_CATEGORIES);

const PLURAL_KEY = /^(.*)\[(zero|one|two|few|many|other)\]$/;

export function isAndroidPluralCategory(value: string): value is I18nextPluralCategory {
  return ANDROID_PLURAL_CATEGORY_SET.has(value);
}

export function makeAndroidPluralKey(baseKey: string, category: I18nextPluralCategory): string {
  return `${baseKey}[${category}]`;
}

export function androidPluralBaseKey(key: string): string | undefined {
  return PLURAL_KEY.exec(key)?.[1];
}

export function androidPluralCategoryOf(key: string): I18nextPluralCategory | undefined {
  const category = PLURAL_KEY.exec(key)?.[2];
  return category === undefined ? undefined : (category as I18nextPluralCategory);
}
