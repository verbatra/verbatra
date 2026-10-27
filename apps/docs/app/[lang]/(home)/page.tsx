import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Fragment, type ReactNode } from "react";
import { JsonLd } from "@/components/json-ld";
import { Faq, faqContent } from "@/components/landing/faq";
import { Features } from "@/components/landing/features";
import { FinalCta } from "@/components/landing/final-cta";
import { Hero } from "@/components/landing/hero";
import { Highlights } from "@/components/landing/highlights";
import { ScrollTop } from "@/components/landing/islands";
import { Marquee } from "@/components/landing/marquee";
import { MotionRoot } from "@/components/landing/motion-root";
import { Playground } from "@/components/landing/playground";
import { Statement } from "@/components/landing/statement";
import { toLocale } from "@/lib/i18n";
import { LANDING_SECTIONS, type LandingSectionId } from "@/lib/landing-sections";
import { MAIN_CONTENT_ID } from "@/lib/locale-home-layout";
import { markdownUrl } from "@/lib/markdown-route";
import {
  homeAlternates,
  LANDING_LAST_UPDATED,
  MCP_VERSION,
  PACKAGE_VERSION,
  STUDIO_VERSION,
} from "@/lib/site";
import { homeOgImagePath, socialMetadata } from "@/lib/social-metadata";
import { faqPageLd, softwareApplicationLd } from "@/lib/structured-data";

export default async function HomePage(props: { params: Promise<{ lang: string }> }) {
  const { lang } = await props.params;
  const locale = toLocale(lang);
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "landing" });

  const faqItems = await faqContent(locale);

  const sections: Readonly<Record<LandingSectionId, ReactNode>> = {
    hero: <Hero />,
    marquee: <Marquee />,
    statement: <Statement />,
    highlights: <Highlights />,
    playground: <Playground />,
    features: <Features />,
    faq: <Faq locale={locale} items={faqItems} />,
    finalCta: <FinalCta />,
  };

  return (
    <div className="vk-home w-full">
      <JsonLd
        data={softwareApplicationLd({
          description: t("meta.definition"),
          lang: locale,
          version: PACKAGE_VERSION,
          studioVersion: STUDIO_VERSION,
          mcpVersion: MCP_VERSION,
          dateModified: LANDING_LAST_UPDATED,
        })}
      />
      <JsonLd
        data={faqPageLd({
          items: faqItems.map(({ question, answer }) => ({ question, answer })),
          lang: locale,
        })}
      />

      {LANDING_SECTIONS.map((id) => (
        <Fragment key={id}>{sections[id]}</Fragment>
      ))}
      <MotionRoot />
      <ScrollTop label={t("fab.label")} targetId={MAIN_CONTENT_ID} />
    </div>
  );
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
    alternates: { canonical, languages, types: { "text/markdown": markdownUrl(canonical) } },
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
