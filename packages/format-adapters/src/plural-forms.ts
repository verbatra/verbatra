import type { FormatId, LocaleResource, PluralRuleType } from "@verbatra/core";
import { androidPluralBaseKey, androidPluralCategoryOf } from "./android-xml/plural.js";
import { pluralBaseKey, pluralCategoryOf } from "./i18next/plural.js";
import { icuPluralUses } from "./icu/plural-uses.js";

export interface PluralFormSet {
  readonly key: string;
  readonly ruleType: PluralRuleType;
  readonly categories: readonly string[];
  readonly argument?: string;
}

interface KeyEncoding {
  readonly baseKeyOf: (key: string) => string | undefined;
  readonly categoryOf: (key: string) => string | undefined;
  readonly ruleTypeOf: (baseKey: string) => PluralRuleType;
}

const I18NEXT_ORDINAL_SUFFIX = "_ordinal";

const cardinalOnly = (): PluralRuleType => "cardinal";

const I18NEXT_ENCODING: KeyEncoding = {
  baseKeyOf: pluralBaseKey,
  categoryOf: pluralCategoryOf,
  ruleTypeOf: (baseKey) => (baseKey.endsWith(I18NEXT_ORDINAL_SUFFIX) ? "ordinal" : "cardinal"),
};

const APPLE_ENCODING: KeyEncoding = {
  baseKeyOf: pluralBaseKey,
  categoryOf: pluralCategoryOf,
  ruleTypeOf: cardinalOnly,
};

const ANDROID_ENCODING: KeyEncoding = {
  baseKeyOf: androidPluralBaseKey,
  categoryOf: androidPluralCategoryOf,
  ruleTypeOf: cardinalOnly,
};

function keyEncodedFormSets(
  resource: LocaleResource,
  encoding: KeyEncoding,
): readonly PluralFormSet[] {
  const groups = new Map<string, string[]>();
  for (const [key, entry] of resource.entries) {
    const baseKey = entry.isPlural ? encoding.baseKeyOf(key) : undefined;
    const category = encoding.categoryOf(key);
    if (baseKey === undefined || category === undefined) {
      continue;
    }
    const categories = groups.get(baseKey) ?? [];
    categories.push(category);
    groups.set(baseKey, categories);
  }
  return [...groups].map(([key, categories]) => ({
    key,
    ruleType: encoding.ruleTypeOf(key),
    categories,
  }));
}

function icuPluralFormSets(resource: LocaleResource): readonly PluralFormSet[] {
  return [...resource.entries].flatMap(([key, entry]) =>
    icuPluralUses(entry.value).map((use) => ({ key, ...use })),
  );
}

type PluralFormReader = (resource: LocaleResource) => readonly PluralFormSet[];

const byEncoding =
  (encoding: KeyEncoding): PluralFormReader =>
  (resource) =>
    keyEncodedFormSets(resource, encoding);

const PLURAL_FORM_READERS: ReadonlyMap<FormatId, PluralFormReader> = new Map([
  ["i18next-json", byEncoding(I18NEXT_ENCODING)],
  ["apple-strings", byEncoding(APPLE_ENCODING)],
  ["apple-xcstrings", byEncoding(APPLE_ENCODING)],
  ["android-xml", byEncoding(ANDROID_ENCODING)],
  ["next-intl-json", icuPluralFormSets],
  ["arb", icuPluralFormSets],
]);

export function tracksPluralCategories(format: FormatId): boolean {
  return PLURAL_FORM_READERS.has(format);
}

export function pluralFormSets(
  format: FormatId,
  resource: LocaleResource,
): readonly PluralFormSet[] {
  return PLURAL_FORM_READERS.get(format)?.(resource) ?? [];
}
