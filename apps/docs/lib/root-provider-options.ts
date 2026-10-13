import { i18nProvider, uiTranslations } from "fumadocs-ui/i18n";
import { FocusRestoringSearchDialog } from "@/components/focus-restoring-search-dialog";
import { i18n } from "@/lib/i18n";
import { LOCALE_DISPLAY_NAMES } from "@/lib/language-select-copy";
import { UI_TRANSLATIONS } from "@/lib/ui-translations";

export const translations = i18n.translations().extend(uiTranslations()).add(UI_TRANSLATIONS);

const localeNames = i18n.languages.map((locale) => ({
  locale,
  name: LOCALE_DISPLAY_NAMES[locale],
}));

export const SEARCH_OPTIONS = { preload: false, SearchDialog: FocusRestoringSearchDialog } as const;

export function i18nConfig(locale: string) {
  return { ...i18nProvider(translations, locale), locales: localeNames };
}
