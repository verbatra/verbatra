import "../global.css";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { ReactNode } from "react";
import { DefaultThemeMeta } from "@/components/default-theme-meta";
import { JsonLd } from "@/components/json-ld";
import { FONT_VARIABLES } from "@/lib/fonts";
import { i18n, toLocale } from "@/lib/i18n";
import { homeAlternates, SITE_URL } from "@/lib/site";
import { homeOgImagePath, socialMetadata } from "@/lib/social-metadata";
import { AUTHOR_NAME, organizationLd, SEO_KEYWORDS, websiteLd } from "@/lib/structured-data";
import { DEFAULT_THEME, THEME_INIT_SCRIPT } from "@/lib/theme";

export const dynamicParams = false;

export function generateStaticParams(): Array<{ lang: string }> {
  return i18n.languages.map((lang) => ({ lang }));
}

export async function generateMetadata(props: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await props.params;
  const locale = toLocale(lang);
  const t = await getTranslations({ locale, namespace: "landing.meta" });
  const title = t("title");
  const ogTitle = t("ogTitle");
  const description = t("description");
  const ogDescription = t("ogDescription");
  const ogImageAlt = t("ogImageAlt");
  const { canonical, languages } = homeAlternates(locale);

  return {
    metadataBase: new URL(SITE_URL),
    title: { default: title, template: "%s | verbatra" },
    description,
    keywords: [...SEO_KEYWORDS],
    authors: [{ name: AUTHOR_NAME, url: "https://github.com/mariokreitz" }],
    creator: AUTHOR_NAME,
    publisher: "verbatra",
    formatDetection: { telephone: false, email: false, address: false },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-image-preview": "large",
        "max-snippet": -1,
        "max-video-preview": -1,
      },
    },
    alternates: { canonical, languages },
    ...socialMetadata({
      locale,
      path: canonical,
      type: "website",
      title: ogTitle,
      description: ogDescription,
      image: { path: homeOgImagePath(locale), alt: ogImageAlt },
      twitterTitle: title,
      twitterDescription: description,
    }),
  };
}

export default async function Layout({
  params,
  children,
}: {
  params: Promise<{ lang: string }>;
  children: ReactNode;
}) {
  const { lang } = await params;
  const locale = toLocale(lang);
  setRequestLocale(locale);

  return (
    <html lang={locale} suppressHydrationWarning className={`${DEFAULT_THEME} ${FONT_VARIABLES}`}>
      <head>
        <DefaultThemeMeta />
      </head>
      <body className="flex flex-col min-h-screen">
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <JsonLd data={websiteLd({ lang: locale })} />
        <JsonLd data={organizationLd()} />
        {children}
      </body>
    </html>
  );
}
