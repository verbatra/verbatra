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

export interface OgFontSource {
  readonly family: string;
  readonly sha256: string;
  readonly version: string;
  readonly license: "OFL-1.1";
  readonly vendorUrl: string;
}

export const OG_FONT_SOURCES: Readonly<Record<string, OgFontSource>> = {
  "NotoSansSC[wght].ttf": {
    family: "Noto Sans SC",
    sha256: "a3041811a78c361b1de50f953c805e0244951c21c5bd412f7232ef0d899af0da",
    version: "Version 2.004-H2;hotconv 1.0.118;makeotfexe 2.5.65603",
    license: "OFL-1.1",
    vendorUrl: "http://www.adobe.com/type/",
  },
  "NotoSansJP[wght].ttf": {
    family: "Noto Sans JP",
    sha256: "c2f3b4d463500a2ddcd3849cded1fceeb9fd6d1c32e6cbecd568453ba50fc68f",
    version: "Version 2.004-H2;hotconv 1.0.118;makeotfexe 2.5.65603",
    license: "OFL-1.1",
    vendorUrl: "http://www.adobe.com/type/",
  },
};

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
  ja: [
    {
      name: "Noto Sans JP",
      file: "NotoSansJP-Medium.ttf",
      weight: 500,
      lang: "ja-JP",
      sourceFile: "NotoSansJP[wght].ttf",
      variationAxes: { wght: 500 },
    },
    {
      name: "Noto Sans JP",
      file: "NotoSansJP-Bold.ttf",
      weight: 700,
      lang: "ja-JP",
      sourceFile: "NotoSansJP[wght].ttf",
      variationAxes: { wght: 700 },
    },
  ],
};
