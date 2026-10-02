import { PLURAL_CATEGORIES, type PluralCategory, type PluralRuleType } from "@verbatra/core";
import type { PluralCategoryLookup } from "@verbatra/format-adapters";

const FALLBACK_CATEGORIES: Readonly<Record<PluralRuleType, readonly PluralCategory[]>> = {
  cardinal: ["one", "other"],
  ordinal: ["other"],
};

export type PluralCategoryResolution =
  | { readonly kind: "cldr"; readonly categories: readonly PluralCategory[] }
  | { readonly kind: "fallback"; readonly categories: readonly PluralCategory[] };

function supportedLocaleOf(locale: string): string | undefined {
  try {
    return Intl.PluralRules.supportedLocalesOf([locale.replaceAll("_", "-")])[0];
  } catch {
    return undefined;
  }
}

function cldrCategories(locale: string, type: PluralRuleType): readonly PluralCategory[] {
  const reported = new Set<string>(
    new Intl.PluralRules(locale, { type }).resolvedOptions().pluralCategories,
  );
  return PLURAL_CATEGORIES.filter((category) => reported.has(category));
}

const resolutionCache = new Map<string, PluralCategoryResolution>();

function resolveUncached(locale: string, type: PluralRuleType): PluralCategoryResolution {
  const supported = supportedLocaleOf(locale);
  if (supported === undefined) {
    return { kind: "fallback", categories: FALLBACK_CATEGORIES[type] };
  }
  return { kind: "cldr", categories: cldrCategories(supported, type) };
}

export function resolvePluralCategories(
  locale: string,
  type: PluralRuleType = "cardinal",
): PluralCategoryResolution {
  const cacheKey = `${type}:${locale}`;
  const cached = resolutionCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }
  const resolution = resolveUncached(locale, type);
  resolutionCache.set(cacheKey, resolution);
  return resolution;
}

export function pluralCategoriesFor(
  locale: string,
  type: PluralRuleType = "cardinal",
): readonly PluralCategory[] {
  return resolvePluralCategories(locale, type).categories;
}

export function pluralCategoryLookupFor(locale: string): PluralCategoryLookup {
  return (type) => {
    const resolution = resolvePluralCategories(locale, type);
    return resolution.kind === "cldr" ? resolution.categories : undefined;
  };
}

export interface PluralRulesRuntime {
  readonly icu: string | undefined;
  readonly cldr: string | undefined;
}

export function pluralRulesRuntime(
  versions: Readonly<Record<string, string | undefined>> = process.versions,
): PluralRulesRuntime {
  return { icu: versions.icu, cldr: versions.cldr };
}

function describeRuntime(runtime: PluralRulesRuntime): string {
  if (runtime.icu === undefined) {
    return "The runtime reports no ICU version";
  }
  const cldr = runtime.cldr === undefined ? "" : ` (CLDR ${runtime.cldr})`;
  return `ICU ${runtime.icu}${cldr} supplies the plural rules`;
}

export function describePluralRules(
  targetLocales: readonly string[],
  runtime: PluralRulesRuntime = pluralRulesRuntime(),
): string {
  const unknown = targetLocales.filter(
    (locale) => resolvePluralCategories(locale).kind === "fallback",
  );
  const prefix = describeRuntime(runtime);
  if (unknown.length === 0) {
    return `${prefix}; every target locale has CLDR plural rules.`;
  }
  const quoted = unknown.map((locale) => `"${locale}"`).join(", ");
  return (
    `${prefix}; it has none for ${quoted}, so plural checks there assume one and other ` +
    "and no plural form is generated."
  );
}
