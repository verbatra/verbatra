declare module "subset-font" {
  interface SubsetFontOptions {
    targetFormat?: "sfnt" | "woff" | "woff2";
    keepFeatures?: readonly string[];
    noHinting?: boolean;
    dropTables?: readonly string[];
    variationAxes?: Readonly<Record<string, number>>;
  }

  export default function subsetFont(
    font: Buffer,
    text: string,
    options?: SubsetFontOptions,
  ): Promise<Buffer>;
}
