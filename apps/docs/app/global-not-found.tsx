import "./global.css";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { ReactNode } from "react";
import { DefaultThemeMeta } from "@/components/default-theme-meta";
import { HomeContainer } from "@/components/home-container";
import { LegalFooter } from "@/components/legal-footer";
import { StaticSiteHeader } from "@/components/static-site-header";
import Button from "@/components/ui/button";
import { FONT_VARIABLES } from "@/lib/fonts";
import { i18n, localizedPath } from "@/lib/i18n";
import { MAIN_CONTENT_ID } from "@/lib/locale-home-layout";
import { SITE_URL } from "@/lib/site";
import { TITLE_SUFFIX } from "@/lib/social-metadata";
import { DEFAULT_THEME, THEME_INIT_SCRIPT } from "@/lib/theme";

const locale = i18n.defaultLanguage;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: "notFound.meta" });
  return {
    metadataBase: new URL(SITE_URL),
    title: `${t("title")}${TITLE_SUFFIX}`,
    description: t("description"),
  };
}

export default async function GlobalNotFound(): Promise<ReactNode> {
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "notFound" });
  const nav = await getTranslations({ locale, namespace: "landing.nav" });
  return (
    <html lang={locale} suppressHydrationWarning className={`${DEFAULT_THEME} ${FONT_VARIABLES}`}>
      <head>
        <DefaultThemeMeta />
      </head>
      <body className="flex flex-col min-h-screen">
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <a className="vk-skip-link" href={`#${MAIN_CONTENT_ID}`}>
          {nav("skipToContent")}
        </a>
        <HomeContainer className="[--fd-layout-width:var(--width-layout)]">
          <StaticSiteHeader locale={locale} />
          <main id={MAIN_CONTENT_ID} tabIndex={-1} className="flex flex-1 flex-col">
            <section
              aria-labelledby="not-found-title"
              className="vk-gutter vk-w-wide mx-auto grid w-full flex-1 content-center gap-6 py-24"
            >
              <h1 id="not-found-title" className="vk-h2 max-w-[20ch]">
                {t("title")}
              </h1>
              <p className="vk-lead max-w-[46ch]">{t("lead")}</p>
              <div className="flex flex-wrap gap-3">
                <Button href={localizedPath(locale, "/")} variant="primary" size="lg">
                  {t("home")}
                </Button>
                <Button href={localizedPath(locale, "/docs")} variant="secondary" size="lg">
                  {t("docs")}
                </Button>
              </div>
            </section>
          </main>
          <LegalFooter locale={locale} localeLinks={false} />
        </HomeContainer>
      </body>
    </html>
  );
}
