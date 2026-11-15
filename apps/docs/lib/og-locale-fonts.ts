import type { ImageResponse } from "next/og";
import type { Locale } from "./locales.ts";

export type SatoriFont = NonNullable<
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
  "zh-CN": [
    {
      name: "Noto Sans SC",
      file: "NotoSansSC-Medium.ttf",
      weight: 500,
      lang: "zh-CN",
      sourceFile: "NotoSansSC[wght].ttf",
      variationAxes: { wght: 500 },
    },
    {
      name: "Noto Sans SC",
      file: "NotoSansSC-Bold.ttf",
      weight: 700,
      lang: "zh-CN",
      sourceFile: "NotoSansSC[wght].ttf",
      variationAxes: { wght: 700 },
    },
  ],
  "pt-BR": [],
};
