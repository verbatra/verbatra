/**
 * The six CLDR plural category keywords, in CLDR's canonical order. A language uses a subset of
 * them, and every language uses `other`.
 */
export const PLURAL_CATEGORIES = ["zero", "one", "two", "few", "many", "other"] as const;

/** One CLDR plural category keyword, a member of {@link PLURAL_CATEGORIES}. */
export type PluralCategory = (typeof PLURAL_CATEGORIES)[number];

/**
 * Which CLDR rule set a plural uses: `cardinal` for counts (an ICU `plural`) and `ordinal` for
 * positions such as 1st and 2nd (an ICU `selectordinal`).
 */
export type PluralRuleType = "cardinal" | "ordinal";
