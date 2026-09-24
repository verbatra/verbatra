import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { JsonLd } from "@/components/json-ld";
import { Control } from "@/components/landing/control";
import { Faq, type FaqEntry } from "@/components/landing/faq";
import { FinalCta } from "@/components/landing/final-cta";
import { Gains } from "@/components/landing/gains";
import { Loop } from "@/components/landing/loop";
import { Marquee } from "@/components/landing/marquee";
import { Proof } from "@/components/landing/proof";
import { Providers } from "@/components/landing/providers";
import { LandingHero } from "@/components/landing-hero";
import { toLocale } from "@/lib/i18n";
import { homeAlternates, MCP_VERSION, PACKAGE_VERSION, STUDIO_VERSION } from "@/lib/site";
import { homeOgImagePath, socialMetadata } from "@/lib/social-metadata";
import {
  type FaqItem,
  faqPageLd,
  type HowToStepItem,
  howToLd,
  softwareApplicationLd,
} from "@/lib/structured-data";

const HOW_STEP_KEYS = ["configure", "diff", "translate", "verifyWrite"] as const;

export default async function HomePage(props: { params: Promise<{ lang: string }> }) {
  const { lang } = await props.params;
  const locale = toLocale(lang);
  const t = await getTranslations({ locale, namespace: "landing" });

  const faqItems: ReadonlyArray<FaqEntry> = Object.entries(
    t.raw("faq.items") as Record<string, FaqItem>,
  ).map(([id, item]) => ({ ...item, id }));

  const howStepCopy = t.raw("how.steps") as Record<string, { title: string; body: string }>;
  const howSteps: ReadonlyArray<HowToStepItem> = HOW_STEP_KEYS.map((key) => {
    const step = howStepCopy[key];
    return { name: step?.title ?? "", text: step?.body ?? "" };
  });

  const version = PACKAGE_VERSION;
  const studioVersion = STUDIO_VERSION;
  const mcpVersion = MCP_VERSION;

  return (
    <div className="vk-home w-full">
      <JsonLd
        data={softwareApplicationLd({
          description: t("meta.definition"),
          lang: locale,
          version,
          studioVersion,
          mcpVersion,
        })}
      />
      <JsonLd data={faqPageLd({ items: faqItems, lang: locale })} />
      <JsonLd data={howToLd({ name: t("how.heading"), steps: howSteps, lang: locale })} />

      <LandingHero />
      <Marquee />
      <Proof />
      <Providers />
      <Control />
      <Loop />
      <Gains />
      <Faq items={faqItems} />
      <FinalCta />
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
