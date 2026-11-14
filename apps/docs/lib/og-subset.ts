import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import subsetFont from "subset-font";
import { LOCALES, type Locale } from "./locales.ts";
import { OG_LOCALE_FONTS, type OgLocaleFont } from "./og-locale-fonts.ts";
import { ogCharacters, ogTexts } from "./og-texts.ts";

const BASIC_LATIN = Array.from({ length: 0x5f }, (_, index) =>
  String.fromCodePoint(0x20 + index),
).join("");

export function subsetOgFont(
  source: Buffer,
  characters: string,
  font: Pick<OgLocaleFont, "variationAxes">,
): Promise<Buffer> {
  return subsetFont(source, `${BASIC_LATIN}${characters}`, {
    targetFormat: "sfnt",
    keepFeatures: [],
    noHinting: true,
    dropTables: ["GPOS", "GSUB", "kern", "DSIG"],
    ...(font.variationAxes ? { variationAxes: font.variationAxes } : {}),
  });
}

export function localesWithOgFonts(
  table: Readonly<Record<Locale, readonly OgLocaleFont[]>> = OG_LOCALE_FONTS,
): Locale[] {
  return LOCALES.filter((locale) => table[locale].length > 0);
}

export async function buildOgFontSubsets(options: {
  root: string;
  sourceDir: string;
  table?: Readonly<Record<Locale, readonly OgLocaleFont[]>>;
}): Promise<string[]> {
  const table = options.table ?? OG_LOCALE_FONTS;
  const written: string[] = [];
  for (const locale of localesWithOgFonts(table)) {
    const characters = ogCharacters(ogTexts(locale, options.root));
    for (const font of table[locale]) {
      const source = readFileSync(join(options.sourceDir, font.sourceFile));
      const target = join(options.root, "assets/og-fonts", font.file);
      mkdirSync(join(options.root, "assets/og-fonts"), { recursive: true });
      writeFileSync(target, await subsetOgFont(source, characters, font));
      written.push(target);
    }
  }
  return written;
}
