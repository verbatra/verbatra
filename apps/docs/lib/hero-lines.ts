import de from "../messages/de.json";
import en from "../messages/en.json";
import es from "../messages/es.json";
import fr from "../messages/fr.json";
import type { Locale } from "./i18n";

export const HERO_HEADLINES: Readonly<Record<Locale, string>> = {
  en: en.landing.hero.headline,
  de: de.landing.hero.headline,
  es: es.landing.hero.headline,
  fr: fr.landing.hero.headline,
};

const ROW_ORDER: ReadonlyArray<Locale> = ["en", "de", "fr", "es"];

export const HERO_LOCALE_ROW_COUNT = 2;

export type HeroLocaleRow = { readonly locale: Locale; readonly headline: string };

export function heroLocaleRows(pageLocale: Locale): ReadonlyArray<HeroLocaleRow> {
  return ROW_ORDER.filter((locale) => locale !== pageLocale)
    .slice(0, HERO_LOCALE_ROW_COUNT)
    .map((locale) => ({ locale, headline: HERO_HEADLINES[locale] }));
}
