import { ImageResponse } from "next/og";
import { getTranslations } from "next-intl/server";
import { HERO_OG_LINES } from "@/lib/hero-terminal";
import { toLocale } from "@/lib/i18n";
import { loadOgFonts } from "@/lib/og-fonts";
import { HomeOgFrame, OG_IMAGE_SIZE } from "@/lib/og-image";
import { SITE_URL } from "@/lib/site";

export async function GET(_request: Request, { params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  const locale = toLocale(lang);
  const t = await getTranslations({ locale, namespace: "landing.banner" });

  return new ImageResponse(
    <HomeOgFrame
      headline={t.markup("headline", { accent: (chunks: string) => chunks })}
      lines={HERO_OG_LINES}
      footer={new URL(SITE_URL).host}
    />,
    { ...OG_IMAGE_SIZE, fonts: await loadOgFonts() },
  );
}
