import { ImageResponse } from "next/og";
import { NextResponse } from "next/server";
import { toLocale } from "@/lib/i18n";
import { loadOgFonts } from "@/lib/og-fonts";
import { OG_IMAGE_SIZE, OgFrame } from "@/lib/og-image";
import { SITE_HOST } from "@/lib/site";
import { source } from "@/lib/source";

export function generateStaticParams() {
  return source.generateParams();
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug?: string[]; lang: string }> },
) {
  const { slug, lang } = await params;
  const locale = toLocale(lang);
  const page = source.getPage(slug, locale);
  if (!page) return new NextResponse(null, { status: 404 });

  return new ImageResponse(
    <OgFrame
      title={page.data.title}
      description={page.data.description}
      footer={`${SITE_HOST}${page.url}`}
    />,
    { ...OG_IMAGE_SIZE, fonts: await loadOgFonts() },
  );
}
