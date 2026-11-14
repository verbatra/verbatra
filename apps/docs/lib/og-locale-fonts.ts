import type { ImageResponse } from "next/og";
import type { Locale } from "./locales.ts";

type SatoriFont = NonNullable<
  NonNullable<ConstructorParameters<typeof ImageResponse>[1]>["fonts"]
>[number];

export interface OgLocaleFont {
  readonly name: string;
  readonly file: string;
  readonly weight: 500 | 700;
  readonly lang: SatoriFont["lang"];
  readonly sourceFile: string;
  readonly variationAxes?: Readonly<Record<string, number>>;
}

export const OG_LOCALE_FONTS: Readonly<Record<Locale, readonly OgLocaleFont[]>> = {
  en: [],
  de: [],
  es: [],
  fr: [],
};
