import { i18nProvider, uiTranslations } from "fumadocs-ui/i18n";
import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";
import { LanguageSelectText } from "fumadocs-ui/layouts/shared/slots/language-select";
import { getTranslations } from "next-intl/server";
import { VMark } from "@/components/landing";
import { GithubIcon } from "@/components/landing/github-icon";
import { CONTRIBUTING_URL } from "@/components/landing/links";
import { MailIcon } from "@/components/landing/mail-icon";
import { LocaleAwareLanguageSelect } from "@/components/language-select";
import { i18n, type Locale, localizedPath } from "@/lib/i18n";
import { LOCALE_DISPLAY_NAMES } from "@/lib/language-select-copy";

export const translations = i18n.translations().extend(uiTranslations());

const localeNames = i18n.languages.map((locale) => ({
  locale,
  name: LOCALE_DISPLAY_NAMES[locale],
}));

export function i18nConfig(locale: string) {
  return { ...i18nProvider(translations, locale), locales: localeNames };
}

export async function baseOptions(locale: Locale): Promise<BaseLayoutProps> {
  const t = await getTranslations({ locale, namespace: "landing.nav" });
  return {
    nav: {
      url: localizedPath(locale, "/"),
      title: (
        <span className="inline-flex items-center gap-2">
          <VMark size={20} blur={4} decorative />
          <span
            className="text-base font-semibold tracking-widest"
            style={{ fontFamily: "var(--font-display)" }}
          >
            VERBATRA
          </span>
        </span>
      ),
    },
    links: [
      { text: t("docs"), url: localizedPath(locale, "/docs") },
      { text: t("startWithAi"), url: localizedPath(locale, "/docs/start-with-ai") },
      { text: t("contributing"), url: CONTRIBUTING_URL, external: true },
      {
        type: "icon",
        label: "GitHub",
        text: "GitHub",
        icon: <GithubIcon />,
        url: "https://github.com/verbatra/verbatra",
        external: true,
      },
      {
        type: "icon",
        label: t("contact"),
        text: t("contact"),
        icon: <MailIcon />,
        url: localizedPath(locale, "/contact"),
      },
    ],
    themeSwitch: { enabled: false },
    slots: {
      languageSelect: { root: LocaleAwareLanguageSelect, text: LanguageSelectText },
    },
  };
}
