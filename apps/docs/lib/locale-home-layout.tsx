import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { HomeContainer } from "@/components/home-container";
import { HomeNavProvider, type HomeNavValue } from "@/components/home-nav";
import { HomeSiteHeader } from "@/components/site-header";
import { SiteWordmark } from "@/components/site-wordmark";
import { headerLinks } from "@/lib/header-links";
import { type Locale, localizedPath, toLocale } from "@/lib/i18n";

export const MAIN_CONTENT_ID = "main-content";

export async function homeNavValue(locale: Locale): Promise<HomeNavValue> {
  const t = await getTranslations({ locale, namespace: "landing.topNav" });
  const tNav = await getTranslations({ locale, namespace: "landing.nav" });
  const tOpen = await getTranslations({ locale, namespace: "landing.openSource" });
  return {
    links: headerLinks(locale, { docs: tNav("docs"), reference: tNav("reference") }),
    labels: {
      label: t("label"),
      menuOpen: t("menu.open"),
      menuClose: t("menu.close"),
      menuTitle: t("menu.title"),
      newTab: tOpen("newTab"),
    },
  };
}

export async function LocaleHomeLayout({
  params,
  children,
  footer,
}: {
  params: Promise<{ lang: string }>;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const { lang } = await params;
  const locale = toLocale(lang);
  const t = await getTranslations({ locale, namespace: "landing.nav" });
  const nav = await homeNavValue(locale);
  return (
    <HomeNavProvider value={nav}>
      <a className="vk-skip-link" href={`#${MAIN_CONTENT_ID}`}>
        {t("skipToContent")}
      </a>
      <HomeContainer className="[--fd-layout-width:var(--width-layout)]">
        <HomeSiteHeader wordmark={<SiteWordmark />} homeUrl={localizedPath(locale, "/")} />
        <main id={MAIN_CONTENT_ID} tabIndex={-1} className="flex flex-1 flex-col">
          {children}
        </main>
        {footer}
      </HomeContainer>
    </HomeNavProvider>
  );
}
