import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ImageResponse } from "next/og";
import type { Locale } from "./locales";
import { OG_FONT } from "./og-image";
import { OG_LOCALE_FONTS } from "./og-locale-fonts";

export const OG_FONT_DIR = "assets/og-fonts";

export const OG_FONT_FILES = [
  { name: OG_FONT.display, file: "Geist-Medium.ttf", weight: 500 },
  { name: OG_FONT.display, file: "Geist-Bold.ttf", weight: 700 },
  { name: OG_FONT.mono, file: "GeistMono-Regular.ttf", weight: 400 },
] as const;

type OgFontOption = NonNullable<
  NonNullable<ConstructorParameters<typeof ImageResponse>[1]>["fonts"]
>[number];

const loaded = new Map<Locale, Promise<OgFontOption[]>>();

export function ogFontFilesFor(locale: Locale): string[] {
  return [...OG_FONT_FILES, ...OG_LOCALE_FONTS[locale]].map((font) => font.file);
}

async function readFonts(locale: Locale): Promise<OgFontOption[]> {
  const latin = OG_FONT_FILES.map(async (font) => ({
    name: font.name,
    data: await readFile(join(process.cwd(), OG_FONT_DIR, font.file)),
    weight: font.weight,
    style: "normal" as const,
  }));
  const extra = OG_LOCALE_FONTS[locale].map(async (font) => ({
    name: font.name,
    data: await readFile(join(process.cwd(), OG_FONT_DIR, font.file)),
    weight: font.weight,
    style: "normal" as const,
    lang: font.lang,
  }));
  return Promise.all([...latin, ...extra]);
}

export function loadOgFonts(locale: Locale): Promise<OgFontOption[]> {
  const cached = loaded.get(locale);
  if (cached) return cached;
  const fonts = readFonts(locale);
  loaded.set(locale, fonts);
  return fonts;
}
