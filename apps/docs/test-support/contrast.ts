import { docsStylesheetRules, rulesFor, type StyleRule } from "@/lib/stylesheet-rules";

export type ThemeTokens = Readonly<Record<string, string>>;

type Rgb = readonly [number, number, number];

export function rootDeclarations(
  rules: ReadonlyArray<StyleRule>,
  selector: string,
): Record<string, string> {
  return Object.assign(
    {},
    ...rulesFor(rules, selector)
      .filter((rule) => rule.media === "")
      .map((rule) => rule.declarations),
  );
}

export function themeTokens(rules: ReadonlyArray<StyleRule> = docsStylesheetRules()): {
  dark: ThemeTokens;
  light: ThemeTokens;
} {
  const dark = rootDeclarations(rules, ":root");
  return { dark, light: { ...dark, ...rootDeclarations(rules, "html.light") } };
}

const COLOR_MIX = /^color-mix\(in srgb, (.+) (\d+(?:\.\d+)?)%, (.+)\)$/;

function hex(channels: Rgb): string {
  return `#${channels
    .map((channel) =>
      Math.round(channel * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

export function resolve(tokens: ThemeTokens, value: string, depth = 0): string {
  if (depth > 8) throw new Error(`unresolved ${value}`);
  const trimmed = value.trim();
  const mix = COLOR_MIX.exec(trimmed);
  if (mix?.[1] && mix[2] && mix[3]) {
    const share = Number(mix[2]) / 100;
    const first = rgb(resolve(tokens, mix[1], depth + 1));
    const second = rgb(resolve(tokens, mix[3], depth + 1));
    const blend = (a: number, b: number) => a * share + b * (1 - share);
    return hex([
      blend(first[0], second[0]),
      blend(first[1], second[1]),
      blend(first[2], second[2]),
    ]);
  }
  const reference = /^var\((--[\w-]+)\)$/.exec(trimmed);
  if (!reference?.[1]) return trimmed;
  const next = tokens[reference[1]];
  if (next === undefined) throw new Error(`unresolved ${value}`);
  return resolve(tokens, next, depth + 1);
}

export function rgb(value: string): Rgb {
  const hexMatch = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(value);
  if (hexMatch)
    return [hexMatch[1], hexMatch[2], hexMatch[3]].map(
      (pair) => Number.parseInt(pair ?? "", 16) / 255,
    ) as [number, number, number];
  const match = /^hsl\((\d+(?:\.\d+)?) (\d+(?:\.\d+)?)% (\d+(?:\.\d+)?)%\)$/.exec(value);
  if (!match) throw new Error(`not an hsl() color: ${value}`);
  const [h, s, l] = [Number(match[1]), Number(match[2]) / 100, Number(match[3]) / 100];
  const chroma = s * Math.min(l, 1 - l);
  const channel = (n: number) => {
    const k = (n + h / 30) % 12;
    return l - chroma * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [channel(0), channel(8), channel(4)];
}

export function luminance(value: string): number {
  const [r, g, b] = rgb(value).map((c) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
}

export function contrast(tokens: ThemeTokens, foreground: string, background: string): number {
  const fg = luminance(resolve(tokens, `var(${foreground})`));
  const bg = luminance(resolve(tokens, `var(${background})`));
  return (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
}
