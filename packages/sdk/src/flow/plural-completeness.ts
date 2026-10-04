import {
  type FormatId,
  type LocaleResource,
  PLURAL_CATEGORIES,
  type PluralCategory,
  type PluralRuleType,
} from "@verbatra/core";
import { type PluralFormSet, pluralFormSets } from "@verbatra/format-adapters";
import { pluralCategoryLookupFor } from "./plural-rules.js";

/**
 * One plural in a target locale that lacks CLDR plural categories the target language uses,
 * reported by {@link check} in {@link LocaleCheckSummary.incompletePlurals}.
 *
 * A plural counts only when the source defines it and the target holds at least one of its forms:
 * a plural the target lacks entirely is already counted as missing keys. The categories a language
 * uses come from the runtime's CLDR plural rules; for a language the runtime has no rules for, only
 * `other` is required. `other` is required in every language. An exact-value ICU arm such as `=0`
 * or `=1` never stands in for a category: `=1` matches the number 1 alone, while a category such as
 * Russian `one` also covers 21 and 31. A category the language does not use is not reported.
 */
export interface IncompletePlural {
  /**
   * Always `PLURAL_CATEGORIES_INCOMPLETE`, the code a translation run reports in its notices for the
   * same condition.
   */
  readonly code: "PLURAL_CATEGORIES_INCOMPLETE";
  /**
   * The plural's key. For a format that stores each form under its own key (i18next, Android,
   * Apple `.stringsdict` and `.xcstrings`) this is the base key without the category, `items` for
   * `items_one` or `items[one]`; for an ICU message (next-intl, ARB) it is the message's key.
   */
  readonly key: string;
  /**
   * The argument of the ICU `plural` or `selectordinal` that lacks the categories, such as `count`.
   * Absent for a format that stores each form under its own key.
   */
  readonly argument?: string;
  /** `cardinal` for a count, `ordinal` for an i18next `_ordinal` plural or an ICU `selectordinal`. */
  readonly ruleType: PluralRuleType;
  /** The categories the target language uses that the target does not supply, in CLDR order. */
  readonly missing: readonly PluralCategory[];
}

interface PluralGap {
  readonly set: PluralFormSet;
  readonly missing: Set<PluralCategory>;
}

function identityOf(set: PluralFormSet): string {
  return JSON.stringify([set.key, set.ruleType, set.argument ?? null]);
}

function requiredCategories(locale: string, ruleType: PluralRuleType): readonly PluralCategory[] {
  return pluralCategoryLookupFor(locale)(ruleType) ?? ["other"];
}

function toIncompletePlural(gap: PluralGap): IncompletePlural {
  const { key, argument, ruleType } = gap.set;
  const missing = PLURAL_CATEGORIES.filter((category) => gap.missing.has(category));
  return argument === undefined
    ? { code: "PLURAL_CATEGORIES_INCOMPLETE", key, ruleType, missing }
    : { code: "PLURAL_CATEGORIES_INCOMPLETE", key, argument, ruleType, missing };
}

function compareIncomplete(a: IncompletePlural, b: IncompletePlural): number {
  return (
    a.key.localeCompare(b.key) ||
    (a.argument ?? "").localeCompare(b.argument ?? "") ||
    a.ruleType.localeCompare(b.ruleType)
  );
}

function incompleteAmong(
  sets: readonly PluralFormSet[],
  locale: string,
): readonly IncompletePlural[] {
  const gaps = new Map<string, PluralGap>();
  for (const set of sets) {
    const identity = identityOf(set);
    const present = new Set(set.categories);
    const gap = gaps.get(identity) ?? { set, missing: new Set<PluralCategory>() };
    for (const category of requiredCategories(locale, set.ruleType)) {
      if (!present.has(category)) {
        gap.missing.add(category);
      }
    }
    gaps.set(identity, gap);
  }
  return [...gaps.values()]
    .filter((gap) => gap.missing.size > 0)
    .map(toIncompletePlural)
    .sort(compareIncomplete);
}

export function findIncompletePlurals(
  format: FormatId,
  source: LocaleResource,
  target: LocaleResource,
  locale: string,
): readonly IncompletePlural[] {
  const sourcePlurals = new Set(pluralFormSets(format, source).map(identityOf));
  return incompleteAmong(
    pluralFormSets(format, target).filter((set) => sourcePlurals.has(identityOf(set))),
    locale,
  );
}

export function findIncompleteAbsentPlurals(
  format: FormatId,
  source: LocaleResource,
  target: LocaleResource,
  locale: string,
): readonly IncompletePlural[] {
  const targetPlurals = new Set(pluralFormSets(format, target).map(identityOf));
  return incompleteAmong(
    pluralFormSets(format, source).filter(
      (set) => set.argument === undefined && !targetPlurals.has(identityOf(set)),
    ),
    locale,
  );
}
