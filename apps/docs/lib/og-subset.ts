import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import subsetFont from "subset-font";
import { LOCALES, type Locale } from "./locales.ts";
import {
  OG_FONT_SOURCES,
  OG_LOCALE_FONTS,
  type OgFontSource,
  type OgLocaleFont,
} from "./og-locale-fonts.ts";
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

export function verifyOgFontSource(
  source: Buffer,
  sourceFile: string,
  sources: Readonly<Record<string, OgFontSource>> = OG_FONT_SOURCES,
): void {
  const recorded = sources[sourceFile];
  if (recorded === undefined) {
    throw new Error(`No SHA-256 is recorded for the source font ${sourceFile}.`);
  }
  const actual = createHash("sha256").update(source).digest("hex");
  if (actual !== recorded.sha256) {
    throw new Error(
      `Source font ${sourceFile} has SHA-256 ${actual}, expected ${recorded.sha256}: refusing to subset it.`,
    );
  }
}

export async function buildOgFontSubsets(options: {
  root: string;
  sourceDir: string;
  table?: Readonly<Record<Locale, readonly OgLocaleFont[]>>;
  sources?: Readonly<Record<string, OgFontSource>>;
}): Promise<string[]> {
  const table = options.table ?? OG_LOCALE_FONTS;
  const written: string[] = [];
  for (const locale of localesWithOgFonts(table)) {
    const characters = ogCharacters(ogTexts(locale, options.root));
    for (const font of table[locale]) {
      const source = readFileSync(join(options.sourceDir, font.sourceFile));
      verifyOgFontSource(source, font.sourceFile, options.sources);
      const target = join(options.root, "assets/og-fonts", font.file);
      mkdirSync(join(options.root, "assets/og-fonts"), { recursive: true });
      writeFileSync(target, await subsetOgFont(source, characters, font));
      written.push(target);
    }
  }
  return written;
}
