import { BRAND_MARK_IDS, BRAND_MARKS, type BrandMarkId } from "./brand-marks.ts";

export type BrandTheme = "dark" | "light";

export const BRAND_THEMES: ReadonlyArray<BrandTheme> = ["dark", "light"];

export const BRAND_SURFACES: Readonly<Record<BrandTheme, ReadonlyArray<string>>> = {
  dark: ["hsl(240 24% 4%)", "hsl(240 28% 14%)"],
  light: ["hsl(240 20% 98%)", "hsl(240 18% 95%)"],
};

export const MIN_BRAND_CONTRAST = 3;

const HEX = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i;
const HSL = /^hsl\((\d+(?:\.\d+)?) (\d+(?:\.\d+)?)% (\d+(?:\.\d+)?)%\)$/;

type Rgb = readonly [number, number, number];

function fromHex(value: string): Rgb {
  const match = HEX.exec(value);
  if (match === null) throw new Error(`not a hex colour: ${value}`);
  return [1, 2, 3].map((index) => Number.parseInt(match[index] ?? "", 16) / 255) as unknown as Rgb;
}

function fromHsl(value: string): Rgb {
  const match = HSL.exec(value);
  if (match === null) throw new Error(`not an hsl colour: ${value}`);
  const hue = Number(match[1]);
  const saturation = Number(match[2]) / 100;
  const lightness = Number(match[3]) / 100;
  const chroma = saturation * Math.min(lightness, 1 - lightness);
  const channel = (offset: number) => {
    const k = (offset + hue / 30) % 12;
    return lightness - chroma * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [channel(0), channel(8), channel(4)];
}

function luminance([red, green, blue]: Rgb): number {
  const linear = (value: number) =>
    value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  return 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue);
}

export function contrastOn(hex: string, surface: string): number {
  const foreground = luminance(fromHex(hex));
  const background = luminance(fromHsl(surface));
  return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
}

export function brandMarkClass(mark: BrandMarkId): string {
  return `vk-brand-${mark}`;
}

export function brandColorThemes(mark: BrandMarkId): ReadonlyArray<BrandTheme> {
  const { hex } = BRAND_MARKS[mark].color;
  return BRAND_THEMES.filter((theme) =>
    BRAND_SURFACES[theme].every((surface) => contrastOn(hex, surface) >= MIN_BRAND_CONTRAST),
  );
}

export function brandColorCss(): string {
  const rules = BRAND_MARK_IDS.flatMap((mark) =>
    brandColorThemes(mark).map(
      (theme) =>
        `html.${theme} .${brandMarkClass(mark)} {\n  color: ${BRAND_MARKS[mark].color.hex};\n}\n`,
    ),
  );
  return rules.join("\n");
}
