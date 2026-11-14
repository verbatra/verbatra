import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Locale } from "./locales";
import { OG_FONT } from "./og-image";
import { OG_LOCALE_FONTS, type SatoriFont } from "./og-locale-fonts";

export const OG_FONT_DIR = "assets/og-fonts";

export const OG_FONT_FILES = [
  { name: OG_FONT.display, file: "Geist-Medium.ttf", weight: 500 },
  { name: OG_FONT.display, file: "Geist-Bold.ttf", weight: 700 },
  { name: OG_FONT.mono, file: "GeistMono-Regular.ttf", weight: 400 },
] as const;

let latin: Promise<SatoriFont[]> | undefined;
const extra = new Map<Locale, Promise<SatoriFont[]>>();

export function ogFontFilesFor(locale: Locale): string[] {
  return [...OG_FONT_FILES, ...OG_LOCALE_FONTS[locale]].map((font) => font.file);
}

function readFonts(
  fonts: readonly {
    name: string;
    file: string;
    weight: 500 | 700 | 400;
    lang?: SatoriFont["lang"];
  }[],
): Promise<SatoriFont[]> {
  return Promise.all(
    fonts.map(async (font) => ({
      name: font.name,
      data: await readFile(join(process.cwd(), OG_FONT_DIR, font.file)),
      weight: font.weight,
      style: "normal" as const,
      ...(font.lang === undefined ? {} : { lang: font.lang }),
    })),
  );
}

function remember<Key>(
  cache: Map<Key, Promise<SatoriFont[]>>,
  key: Key,
  read: () => Promise<SatoriFont[]>,
): Promise<SatoriFont[]> {
  const cached = cache.get(key);
  if (cached) return cached;
  const fonts = read().catch((error: unknown) => {
    cache.delete(key);
    throw error;
  });
  cache.set(key, fonts);
  return fonts;
}

export async function loadOgFonts(locale: Locale): Promise<SatoriFont[]> {
  latin ??= readFonts(OG_FONT_FILES).catch((error: unknown) => {
    latin = undefined;
    throw error;
  });
  const [base, specific] = await Promise.all([
    latin,
    remember(extra, locale, () => readFonts(OG_LOCALE_FONTS[locale])),
  ]);
  return [...base, ...specific];
}
