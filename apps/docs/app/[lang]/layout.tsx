import "../global.css";
import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { ReactNode } from "react";
import { JsonLd } from "@/components/json-ld";
import { i18n, toLocale } from "@/lib/i18n";
import { UMAMI_ORIGIN } from "@/lib/security-headers.mjs";
import { homeAlternates, SITE_HOST, SITE_URL } from "@/lib/site";
import { homeOgImagePath, socialMetadata } from "@/lib/social-metadata";
import { AUTHOR_NAME, organizationLd, SEO_KEYWORDS, websiteLd } from "@/lib/structured-data";
import { DEFAULT_THEME, THEME_COLORS } from "@/lib/theme";

const sans = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });

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

export const viewport: Viewport = {
  themeColor: THEME_COLORS[DEFAULT_THEME],
  colorScheme: DEFAULT_THEME,
};

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
    <html
      lang={locale}
      suppressHydrationWarning
      className={`${DEFAULT_THEME} ${sans.variable} ${mono.variable}`}
    >
      <head>
        <link rel="preconnect" href={UMAMI_ORIGIN} crossOrigin="anonymous" />
        <link rel="dns-prefetch" href={UMAMI_ORIGIN} />
      </head>
      <body className="flex flex-col min-h-screen">
        <JsonLd data={websiteLd({ lang: locale })} />
        <JsonLd data={organizationLd()} />
        {children}
        <Script
          defer
          src={`${UMAMI_ORIGIN}/script.js`}
          data-website-id="fcf007b7-4579-4486-881c-e8686d61d63d"
          data-do-not-track="true"
          data-domains={SITE_HOST}
          data-exclude-hash="true"
          strategy="lazyOnload"
        />
      </body>
    </html>
  );
}
