import { i18n, type Locale, localizedPath } from "./i18n";
import versionData from "./version.generated.json";

export const SITE_URL = "https://verbatra.kreitz-webdev.de";

export const PACKAGE_VERSION = versionData.version;

export const STUDIO_VERSION = versionData.studioVersion;

export const MCP_VERSION = versionData.mcpVersion;

export const LEGAL_LAST_UPDATED = "2026-09-01";

export function localeAlternates(locale: Locale, path: string) {
  const languages: Record<string, string> = {};
  for (const lang of i18n.languages) {
    languages[lang] = localizedPath(lang, path);
  }
  languages["x-default"] = localizedPath(i18n.defaultLanguage, path);
  return { canonical: localizedPath(locale, path), languages };
}

export function homePath(locale: Locale): string {
  return locale === i18n.defaultLanguage ? "/" : `/${locale}`;
}

export function homeAlternates(locale: Locale) {
  const languages: Record<string, string> = {};
  for (const lang of i18n.languages) {
    languages[lang] = homePath(lang);
  }
  languages["x-default"] = homePath(i18n.defaultLanguage);
  return { canonical: homePath(locale), languages };
}

const OG_LOCALES: Record<Locale, string> = {
  en: "en_US",
  de: "de_DE",
  es: "es_ES",
  fr: "fr_FR",
};

export function ogLocale(locale: Locale): string {
  return OG_LOCALES[locale];
}

export function ogAlternateLocales(locale: Locale): string[] {
  return i18n.languages.filter((lang) => lang !== locale).map((lang) => OG_LOCALES[lang]);
}
