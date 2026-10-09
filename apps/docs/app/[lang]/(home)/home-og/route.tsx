import { ImageResponse } from "next/og";
import { getTranslations } from "next-intl/server";
import { HERO_HEADLINES, heroLocaleRows } from "@/lib/hero-ledger";
import { toLocale } from "@/lib/i18n";
import { HERO_COUNT_FACTS } from "@/lib/landing-facts";
import { loadOgFonts } from "@/lib/og-fonts";
import { HomeOgFrame, OG_IMAGE_SIZE } from "@/lib/og-image";
import { SITE_URL } from "@/lib/site";

export async function GET(_request: Request, { params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  const locale = toLocale(lang);
  const t = await getTranslations({ locale, namespace: "landing.hero.facts" });

  return new ImageResponse(
    <HomeOgFrame
      headline={{ locale, text: HERO_HEADLINES[locale] }}
      rows={heroLocaleRows(locale).map((row) => ({ locale: row.locale, text: row.headline }))}
      numbers={HERO_COUNT_FACTS.map((fact) => ({
        label: t(fact.key),
        value: String(fact.value),
      }))}
      footer={new URL(SITE_URL).host}
    />,
    { ...OG_IMAGE_SIZE, fonts: await loadOgFonts() },
  );
}
