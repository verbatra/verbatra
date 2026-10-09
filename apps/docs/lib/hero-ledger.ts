import de from "../messages/de.json";
import en from "../messages/en.json";
import es from "../messages/es.json";
import fr from "../messages/fr.json";
import lock from "../verbatra.lock.json";
import { i18n, type Locale } from "./i18n";

export const HERO_HEADLINE_KEY = "landing.hero.headline";

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

export type LedgerRow = {
  readonly locale: Locale;
  readonly file: string;
  readonly value: string;
  readonly source: boolean;
};

const SOURCE_LOCALE: Locale = i18n.defaultLanguage as Locale;

function lockedHash(): string {
  const hashes = new Set(
    Object.values(lock.locales).map(
      (entries) => (entries as Readonly<Record<string, string>>)[HERO_HEADLINE_KEY],
    ),
  );
  const [hash, ...others] = [...hashes];
  if (hash === undefined || others.length > 0) {
    throw new Error(`verbatra.lock.json holds no single hash for ${HERO_HEADLINE_KEY}`);
  }
  return hash;
}

export const HERO_HEADLINE_LOCK_HASH: string = lockedHash();

export const LEDGER_LOCK_FILE = "verbatra.lock.json";

export function ledgerRows(pageLocale: Locale): ReadonlyArray<LedgerRow> {
  const targets = i18n.languages.filter((locale) => locale !== SOURCE_LOCALE);
  const ordered = [
    SOURCE_LOCALE,
    ...targets.filter((locale) => locale === pageLocale),
    ...targets.filter((locale) => locale !== pageLocale),
  ];
  return ordered.map((locale) => ({
    locale,
    file: `messages/${locale}.json`,
    value: HERO_HEADLINES[locale],
    source: locale === SOURCE_LOCALE,
  }));
}
