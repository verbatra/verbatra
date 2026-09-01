import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { JsonLd } from "@/components/json-ld";
import { Faq, type FaqEntry } from "@/components/landing/faq";
import { Features } from "@/components/landing/features";
import { FinalCta } from "@/components/landing/final-cta";
import { FullFooter } from "@/components/landing/footer";
import { FrameworksCloud } from "@/components/landing/frameworks-cloud";
import { HowItWorks } from "@/components/landing/how-it-works";
import { Pillars } from "@/components/landing/pillars";
import { ProvidersCloud } from "@/components/landing/providers-cloud";
import { StudioShowcase } from "@/components/landing/studio-showcase";
import { LandingHero } from "@/components/landing-hero";
import { localizedPath, toLocale } from "@/lib/i18n";
import {
  homeAlternates,
  MCP_VERSION,
  ogAlternateLocales,
  ogLocale,
  PACKAGE_VERSION,
  SITE_URL,
  STUDIO_VERSION,
} from "@/lib/site";
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
      <Pillars />
      <FrameworksCloud />
      <ProvidersCloud />
      <HowItWorks />
      <StudioShowcase />
      <Features />
      <Faq items={faqItems} />
      <FinalCta />
      <FullFooter />
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
  const ogImagePath = localizedPath(locale, "/home-og");

  return {
    openGraph: {
      type: "website",
      siteName: "verbatra",
      locale: ogLocale(locale),
      alternateLocale: ogAlternateLocales(locale),
      url: new URL(canonical, SITE_URL).href,
      title: ogTitle,
      description: ogDescription,
      images: [{ url: ogImagePath, width: 1200, height: 630, alt: ogImageAlt }],
    },
    twitter: {
      card: "summary_large_image",
      site: "@mariokreitz",
      creator: "@mariokreitz",
      title,
      description,
      images: [ogImagePath],
    },
  };
}
