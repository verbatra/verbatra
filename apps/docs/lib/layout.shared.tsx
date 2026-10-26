import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";
import { LanguageSelectText } from "fumadocs-ui/layouts/shared/slots/language-select";
import { getTranslations } from "next-intl/server";
import { LocaleAwareLanguageSelect } from "@/components/language-select";
import { SiteWordmark } from "@/components/site-wordmark";
import { ThemeToggle } from "@/components/theme-toggle";
import { headerLinks } from "@/lib/header-links";
import { type Locale, localizedPath } from "@/lib/i18n";

export async function baseOptions(locale: Locale): Promise<BaseLayoutProps> {
  const t = await getTranslations({ locale, namespace: "landing.nav" });
  return {
    nav: {
      url: localizedPath(locale, "/"),
      title: <SiteWordmark />,
    },
    links: headerLinks(locale, { docs: t("docs"), reference: t("reference") }),
    slots: {
      languageSelect: { root: LocaleAwareLanguageSelect, text: LanguageSelectText },
      themeSwitch: ThemeToggle,
    },
  };
}
