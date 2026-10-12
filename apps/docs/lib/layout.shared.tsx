import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";
import { LanguageSelectText } from "fumadocs-ui/layouts/shared/slots/language-select";
import { getTranslations } from "next-intl/server";
import { GithubIcon } from "@/components/landing/github-icon";
import { GITHUB_URL } from "@/components/landing/links";
import { LocaleAwareLanguageSelect } from "@/components/language-select";
import { SiteWordmark } from "@/components/site-wordmark";
import { ThemeToggle } from "@/components/theme-toggle";
import { type Locale, localizedPath } from "@/lib/i18n";

export async function baseOptions(locale: Locale): Promise<BaseLayoutProps> {
  const t = await getTranslations({ locale, namespace: "landing.nav" });
  return {
    nav: {
      url: localizedPath(locale, "/"),
      title: <SiteWordmark />,
    },
    links: [
      { text: t("docs"), url: localizedPath(locale, "/docs") },
      { text: t("reference"), url: localizedPath(locale, "/docs/cli") },
      {
        type: "icon",
        label: "GitHub",
        text: "GitHub",
        icon: <GithubIcon />,
        url: GITHUB_URL,
        external: true,
      },
    ],
    slots: {
      languageSelect: { root: LocaleAwareLanguageSelect, text: LanguageSelectText },
      themeSwitch: ThemeToggle,
    },
  };
}
