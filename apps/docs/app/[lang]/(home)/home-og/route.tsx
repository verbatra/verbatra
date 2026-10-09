import { ImageResponse } from "next/og";
import { getTranslations } from "next-intl/server";
import { HERO_HEADLINES, heroLocaleRows } from "@/lib/hero-lines";
import { toLocale } from "@/lib/i18n";
import { HERO_NUMBERS } from "@/lib/landing-facts";
import { loadOgFonts } from "@/lib/og-fonts";
import { HomeOgFrame, OG_IMAGE_SIZE } from "@/lib/og-image";
import { SITE_URL } from "@/lib/site";

export async function GET(_request: Request, { params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  const locale = toLocale(lang);
  const t = await getTranslations({ locale, namespace: "landing.hero.numbers" });

  return new ImageResponse(
    <HomeOgFrame
      headline={{ locale, text: HERO_HEADLINES[locale] }}
      rows={heroLocaleRows(locale).map((row) => ({ locale: row.locale, text: row.headline }))}
      numbers={HERO_NUMBERS.map((number) => ({
        label: t(number.key),
        value: String(number.value),
      }))}
      footer={new URL(SITE_URL).host}
    />,
    { ...OG_IMAGE_SIZE, fonts: await loadOgFonts() },
  );
}
