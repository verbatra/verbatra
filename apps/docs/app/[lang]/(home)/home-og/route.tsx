import { ImageResponse } from "next/og";
import { getTranslations } from "next-intl/server";
import { toLocale } from "@/lib/i18n";
import { OG_IMAGE_SIZE, OgFrame } from "@/lib/og-image";
import { SITE_URL } from "@/lib/site";

export async function GET(_request: Request, { params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  const locale = toLocale(lang);
  const t = await getTranslations({ locale, namespace: "landing.meta" });

  return new ImageResponse(
    <OgFrame
      eyebrow={locale.toUpperCase()}
      title={t("ogTitle")}
      description={t("ogDescription")}
      footer={new URL(SITE_URL).host}
    />,
    { ...OG_IMAGE_SIZE },
  );
}
