export const LOCALES = ["en", "de", "es", "fr"] as const;

export const DEFAULT_LOCALE = "en" satisfies (typeof LOCALES)[number];

export type Locale = (typeof LOCALES)[number];

export type TranslatedLocale = Exclude<Locale, typeof DEFAULT_LOCALE>;

export const TRANSLATED_LOCALES: readonly TranslatedLocale[] = LOCALES.filter(
  (locale): locale is TranslatedLocale => locale !== DEFAULT_LOCALE,
);

export function localeAlternation(locales: readonly string[] = LOCALES): string {
  return locales.map((locale) => locale.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
}

export function localeSuffixes(translated: readonly string[] = TRANSLATED_LOCALES): string[] {
  return ["", ...translated.map((locale) => `.${locale}`)];
}

export function translationFilePattern(
  translated: readonly string[] = TRANSLATED_LOCALES,
  extension = "mdx",
): RegExp {
  return new RegExp(`^(.*)\\.(${localeAlternation(translated)})\\.${extension}$`);
}

export function localePrefix(locale: Locale): string {
  return locale === DEFAULT_LOCALE ? "" : `/${locale}`;
}
