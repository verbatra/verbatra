import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { THEMES } from "./index.ts";

const css = readFileSync(new URL("./tokens.css", import.meta.url), "utf8");

interface Block {
  readonly selector: string;
  readonly declarations: ReadonlyMap<string, string>;
}

function parseBlocks(source: string): readonly Block[] {
  const blocks: Block[] = [];
  const pattern = /([^{}]+)\{([^{}]*)\}/g;
  for (const match of source.matchAll(pattern)) {
    const declarations = new Map<string, string>();
    for (const declaration of (match[2] ?? "").matchAll(/([-\w]+)\s*:\s*([^;]+);/g)) {
      declarations.set(declaration[1] ?? "", (declaration[2] ?? "").trim());
    }
    blocks.push({ selector: (match[1] ?? "").replace(/\s+/g, " ").trim(), declarations });
  }
  return blocks;
}

const blocks = parseBlocks(css);
const declared = new Set(
  blocks.flatMap((block) => [...block.declarations.keys()].filter((name) => name.startsWith("--"))),
);

function themeBlock(theme: string): Block {
  const found = blocks.find((block) => block.selector.includes(`.${theme}`));
  if (!found) throw new Error(`no ${theme} block`);
  return found;
}

const THEMED_TOKENS = [
  ...new Set(THEMES.flatMap((theme) => [...themeBlock(theme).declarations.keys()])),
];

describe("tokens.css", () => {
  it("declares themed tokens", () => {
    expect(THEMED_TOKENS.length).toBeGreaterThan(0);
  });

  it("declares the scale families under :root", () => {
    const root = blocks.filter((block) => block.selector === ":root");
    const names = root.flatMap((block) => [...block.declarations.keys()]);
    expect(names.length).toBeGreaterThan(0);
    for (const prefix of [
      "--radius-",
      "--gutter",
      "--width-",
      "--ease-",
      "--duration-",
      "--motion-distance-",
      "--text-",
      "--leading-",
      "--tracking-",
    ]) {
      expect(
        names.some((name) => name.startsWith(prefix)),
        prefix,
      ).toBe(true);
    }
  });

  it.each(THEMES)("declares every themed token under the %s selectors", (theme) => {
    const block = themeBlock(theme);
    expect(block.selector).toBe(`.${theme}, [data-theme="${theme}"]`);
    expect(THEMED_TOKENS.filter((name) => !block.declarations.has(name))).toEqual([]);
  });

  it("gives the two themes different values for every themed token", () => {
    const [dark, light] = THEMES.map(themeBlock);
    const same = THEMED_TOKENS.filter(
      (name) => dark?.declarations.get(name) === light?.declarations.get(name),
    );
    expect(same).toEqual([]);
  });

  it("never declares a themed token outside the theme selectors", () => {
    const rootBlocks = blocks.filter((block) => block.selector === ":root");
    const leaked = THEMED_TOKENS.filter((name) =>
      rootBlocks.some((block) => block.declarations.has(name)),
    );
    expect(leaked).toEqual([]);
  });

  it("resolves every var() reference to a declared token or a fallback", () => {
    const unresolved = [...css.matchAll(/var\((--[\w-]+)\s*([,)])/g)]
      .filter((match) => match[2] === ")" && !declared.has(match[1] ?? ""))
      .map((match) => match[1]);
    expect(unresolved).toEqual([]);
  });

  it("declares the heading font rule inside the base layer so utilities can override it", () => {
    expect(css).toMatch(
      /@layer base\s*\{\s*h1,\s*h2,\s*h3,\s*h4,\s*h5,\s*h6\s*\{[^}]*font-family: var\(--font-display\)/,
    );
    expect(css).not.toMatch(/^h1,/m);
  });

  it("binds headings to the display font", () => {
    const headings = blocks.find((block) => block.selector.startsWith("h1,"));
    expect(headings?.selector).toBe("h1, h2, h3, h4, h5, h6");
    expect(headings?.declarations.get("font-family")).toBe("var(--font-display)");
  });
});

type Rgb = readonly [number, number, number];

function rootTokens(theme: string): ReadonlyMap<string, string> {
  const merged = new Map<string, string>();
  for (const block of blocks.filter((candidate) => candidate.selector === ":root")) {
    for (const [name, value] of block.declarations) merged.set(name, value);
  }
  for (const [name, value] of themeBlock(theme).declarations) merged.set(name, value);
  return merged;
}

function hslToRgb(value: string): Rgb {
  const match = /^hsl\((\d+(?:\.\d+)?) (\d+(?:\.\d+)?)% (\d+(?:\.\d+)?)%\)$/.exec(value);
  if (!match) throw new Error(`not an opaque hsl() color: ${value}`);
  const [h, s, l] = [Number(match[1]), Number(match[2]) / 100, Number(match[3]) / 100];
  const chroma = s * Math.min(l, 1 - l);
  const channel = (n: number): number => {
    const k = (n + h / 30) % 12;
    return l - chroma * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [channel(0), channel(8), channel(4)];
}

function resolveColor(tokens: ReadonlyMap<string, string>, name: string, depth = 0): Rgb {
  if (depth > 8) throw new Error(`unresolved ${name}`);
  const value = tokens.get(name);
  if (value === undefined) throw new Error(`undeclared ${name}`);
  const reference = /^var\((--[\w-]+)\)$/.exec(value);
  return reference?.[1] ? resolveColor(tokens, reference[1], depth + 1) : hslToRgb(value);
}

function relativeLuminance(color: Rgb): number {
  const [r, g, b] = color.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
}

function ratio(foreground: Rgb, background: Rgb): number {
  const [a, b] = [relativeLuminance(foreground), relativeLuminance(background)];
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function softOver(tokens: ReadonlyMap<string, string>, soft: string, backdrop: Rgb): Rgb {
  const match = /^color-mix\(in srgb, var\((--[\w-]+)\) (\d+)%, transparent\)$/.exec(
    tokens.get(soft) ?? "",
  );
  if (!match?.[1] || !match[2]) throw new Error(`${soft} is not a color-mix over transparent`);
  const share = Number(match[2]) / 100;
  const base = resolveColor(tokens, match[1]);
  return base.map((c, i) => c * share + (backdrop[i] ?? 0) * (1 - share)) as unknown as Rgb;
}

const AA = 4.5;
const TONES = [
  "--status-success",
  "--status-warning",
  "--status-danger",
  "--status-neutral",
  "--diff-missing",
  "--diff-changed",
  "--diff-orphaned",
  "--diff-protected",
] as const;
const SURFACES = [
  "--surface-bg",
  "--surface-card",
  "--surface-raised",
  "--surface-muted",
  "--surface-tile",
] as const;

describe.each(THEMES)("status and diff tokens in the %s theme", (theme) => {
  const tokens = rootTokens(theme);

  it.each(TONES)("%s reads at AA on every surface", (tone) => {
    for (const surface of SURFACES) {
      const value = ratio(resolveColor(tokens, tone), resolveColor(tokens, surface));
      expect(value, `${tone} on ${surface}`).toBeGreaterThanOrEqual(AA);
    }
  });

  it.each(TONES)("%s reads at AA on its own soft tint", (tone) => {
    for (const surface of SURFACES) {
      const tint = softOver(tokens, `${tone}-soft`, resolveColor(tokens, surface));
      const value = ratio(resolveColor(tokens, tone), tint);
      expect(value, `${tone} on ${tone}-soft over ${surface}`).toBeGreaterThanOrEqual(AA);
    }
  });

  it("keeps the danger fill legible under its foreground", () => {
    const value = ratio(
      resolveColor(tokens, "--status-danger-fg"),
      resolveColor(tokens, "--status-danger"),
    );
    expect(value).toBeGreaterThanOrEqual(AA);
  });

  it("keeps the accent fill legible under its foreground", () => {
    const value = ratio(
      resolveColor(tokens, "--accent-fill-fg"),
      resolveColor(tokens, "--accent-fill"),
    );
    expect(value).toBeGreaterThanOrEqual(AA);
  });

  it("keeps the danger hover fill legible under its foreground and apart from the base fill", () => {
    const strong = resolveColor(tokens, "--status-danger-strong");
    expect(ratio(resolveColor(tokens, "--status-danger-fg"), strong)).toBeGreaterThanOrEqual(AA);
    expect(strong).not.toEqual(resolveColor(tokens, "--status-danger"));
  });

  it("keeps protected distinct from changed", () => {
    expect(resolveColor(tokens, "--diff-protected")).not.toEqual(
      resolveColor(tokens, "--diff-changed"),
    );
  });
});

describe.each(THEMES)("field border in the %s theme", (theme) => {
  const tokens = rootTokens(theme);
  const FIELD_BACKDROPS = [
    "--surface-raised",
    "--surface-tile",
    "--surface-bg",
    "--surface-card",
  ] as const;

  it.each(FIELD_BACKDROPS)("--border-field clears 3:1 on %s without being heavy", (surface) => {
    const value = ratio(resolveColor(tokens, "--border-field"), resolveColor(tokens, surface));
    expect(value).toBeGreaterThanOrEqual(3.2);
    expect(value).toBeLessThan(5);
  });

  it("strengthens the edge on hover and keeps the invalid edge at 3:1", () => {
    const fill = resolveColor(tokens, "--surface-raised");
    const rest = ratio(resolveColor(tokens, "--border-field"), fill);
    const hover = ratio(resolveColor(tokens, "--text-faint"), fill);
    const invalid = ratio(resolveColor(tokens, "--status-danger"), fill);

    expect(hover).toBeGreaterThan(rest + 0.5);
    expect(invalid).toBeGreaterThanOrEqual(3);
  });
});

describe.each(THEMES)("warning hue in the %s theme", (theme) => {
  const hue = (name: string): number => {
    const value = themeBlock(theme).declarations.get(name) ?? "";
    return Number(/^hsl\((\d+)/.exec(value)?.[1]);
  };

  it("sits at least 30 degrees from the changed hue, so two bordered badges read apart", () => {
    const gap = Math.abs(hue("--v-warning") - hue("--v-status-changed"));

    expect(Math.min(gap, 360 - gap)).toBeGreaterThanOrEqual(30);
  });
});

describe("diff token mapping", () => {
  const root = rootTokens("dark");

  it.each([
    ["--diff-missing", "var(--v-status-new)"],
    ["--diff-changed", "var(--v-status-changed)"],
    ["--diff-orphaned", "var(--v-neutral)"],
    ["--diff-protected", "var(--v-status-protected)"],
  ])("%s aliases %s", (name, expected) => {
    expect(root.get(name)).toBe(expected);
  });
});
