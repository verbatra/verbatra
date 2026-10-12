import "./global.css";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { ReactNode } from "react";
import { LegalFooter } from "@/components/legal-footer";
import { SiteProviders } from "@/components/site-providers";
import Button from "@/components/ui/button";
import { FONT_VARIABLES } from "@/lib/fonts";
import { i18n, localizedPath } from "@/lib/i18n";
import { LocaleHomeLayout } from "@/lib/locale-home-layout";
import { SITE_URL } from "@/lib/site";
import { DEFAULT_THEME, THEME_INIT_SCRIPT } from "@/lib/theme";

const locale = i18n.defaultLanguage;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: "notFound.meta" });
  return {
    metadataBase: new URL(SITE_URL),
    title: `${t("title")} | verbatra`,
    description: t("description"),
    robots: { index: false, follow: true },
  };
}

export default async function GlobalNotFound(): Promise<ReactNode> {
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "notFound" });
  return (
    <html lang={locale} suppressHydrationWarning className={`${DEFAULT_THEME} ${FONT_VARIABLES}`}>
      <body className="flex flex-col min-h-screen">
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <SiteProviders locale={locale}>
          <LocaleHomeLayout
            params={Promise.resolve({ lang: locale })}
            footer={<LegalFooter locale={locale} />}
          >
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
          </LocaleHomeLayout>
        </SiteProviders>
      </body>
    </html>
  );
}
