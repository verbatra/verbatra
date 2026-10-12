import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Fragment, type ReactNode } from "react";
import { JsonLd } from "@/components/json-ld";
import { Bento } from "@/components/landing/bento";
import { CodeShowcase } from "@/components/landing/code-showcase";
import { Compare } from "@/components/landing/compare";
import { Ecosystem } from "@/components/landing/ecosystem";
import { Faq, type FaqEntry } from "@/components/landing/faq";
import { FinalCta } from "@/components/landing/final-cta";
import { Hero } from "@/components/landing/hero";
import { MotionRoot } from "@/components/landing/motion-root";
import { OpenSource } from "@/components/landing/open-source";
import { Problem } from "@/components/landing/problem";
import { ProofStrip } from "@/components/landing/proof-strip";
import { Showcase } from "@/components/landing/showcase";
import { Steps } from "@/components/landing/steps";
import { Studio } from "@/components/landing/studio";
import { toLocale } from "@/lib/i18n";
import { withoutInlineCode } from "@/lib/inline-code-text";
import { LANDING_STEP_IDS } from "@/lib/landing-code";
import { LANDING_SECTIONS, type LandingSectionId } from "@/lib/landing-sections";
import { homeAlternates, MCP_VERSION, PACKAGE_VERSION, STUDIO_VERSION } from "@/lib/site";
import { homeOgImagePath, socialMetadata } from "@/lib/social-metadata";
import {
  type FaqItem,
  faqPageLd,
  type HowToStepItem,
  howToLd,
  softwareApplicationLd,
} from "@/lib/structured-data";

export default async function HomePage(props: { params: Promise<{ lang: string }> }) {
  const { lang } = await props.params;
  const locale = toLocale(lang);
  const t = await getTranslations({ locale, namespace: "landing" });

  const faqItems: ReadonlyArray<FaqItem & FaqEntry> = Object.entries(
    t.raw("faq.items") as Record<string, FaqItem>,
  ).map(([id, item]) => ({ ...item, id }));
  const faqQuestions: ReadonlyArray<FaqEntry> = faqItems.map(({ id, question }) => ({
    id,
    question,
  }));

  const howSteps: ReadonlyArray<HowToStepItem> = LANDING_STEP_IDS.map((id) => ({
    name: t(`steps.items.${id}.title`),
    text: withoutInlineCode(t(`steps.items.${id}.body`)),
  }));

  const sections: Readonly<Record<LandingSectionId, ReactNode>> = {
    hero: <Hero />,
    proofStrip: <ProofStrip />,
    problem: <Problem />,
    howItWorks: <Steps />,
    features: <Bento />,
    code: <CodeShowcase />,
    showcase: <Showcase />,
    ecosystem: <Ecosystem />,
    studio: <Studio />,
    compare: <Compare />,
    openSource: <OpenSource />,
    faq: <Faq items={faqQuestions} />,
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
        })}
      />
      <JsonLd data={faqPageLd({ items: faqItems, lang: locale })} />
      <JsonLd data={howToLd({ name: t("steps.heading"), steps: howSteps, lang: locale })} />

      {LANDING_SECTIONS.map((id) => (
        <Fragment key={id}>{sections[id]}</Fragment>
      ))}
      <MotionRoot />
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
  const { canonical } = homeAlternates(locale);

  return socialMetadata({
    locale,
    path: canonical,
    type: "website",
    title: ogTitle,
    description: ogDescription,
    image: { path: homeOgImagePath(locale), alt: ogImageAlt },
    twitterTitle: title,
    twitterDescription: description,
  });
}
