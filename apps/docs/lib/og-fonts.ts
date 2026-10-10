import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { OG_FONT } from "./og-image";

export const OG_FONT_DIR = "assets/og-fonts";

export const OG_FONT_FILES = [
  { name: OG_FONT.display, file: "SpaceGrotesk-Medium.ttf", weight: 500 },
  { name: OG_FONT.display, file: "SpaceGrotesk-Bold.ttf", weight: 700 },
  { name: OG_FONT.mono, file: "JetBrainsMono-Regular.ttf", weight: 400 },
] as const;

export type OgFontOption = {
  name: string;
  data: Buffer;
  weight: (typeof OG_FONT_FILES)[number]["weight"];
  style: "normal";
};

let loaded: Promise<OgFontOption[]> | undefined;

export function loadOgFonts(): Promise<OgFontOption[]> {
  loaded ??= Promise.all(
    OG_FONT_FILES.map(async (font) => ({
      name: font.name,
      data: await readFile(join(process.cwd(), OG_FONT_DIR, font.file)),
      weight: font.weight,
      style: "normal" as const,
    })),
  );
  return loaded;
}
