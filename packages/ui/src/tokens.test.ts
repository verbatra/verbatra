import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { THEMES } from "./index.js";

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
    for (const declaration of (match[2] ?? "").matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
      declarations.set(declaration[1] ?? "", (declaration[2] ?? "").trim());
    }
    blocks.push({ selector: (match[1] ?? "").replace(/\s+/g, " ").trim(), declarations });
  }
  return blocks;
}

const blocks = parseBlocks(css);
const declared = new Set(blocks.flatMap((block) => [...block.declarations.keys()]));

function themeBlock(theme: string): Block {
  const found = blocks.find((block) => block.selector.includes(`.${theme}`));
  if (!found) throw new Error(`no ${theme} block`);
  return found;
}

const THEMED_TOKENS = [
  "--v-purple",
  "--v-glow",
  "--v-void",
  "--v-status-changed",
  "--v-status-unchanged",
  "--v-danger",
  "--shadow-panel",
  "--shadow-sm",
  "--surface-page",
  "--surface-bg",
  "--surface-card",
  "--surface-raised",
  "--surface-muted",
  "--surface-hover",
  "--border-default",
  "--text-strong",
  "--text-muted",
  "--text-faint",
  "--text-on-accent",
  "--pill-new-end",
  "--pill-new-rim",
  "--scrim",
];

const SHARED_TOKENS = [
  "--font-sans",
  "--font-mono",
  "--font-display",
  "--text-base",
  "--text-sm",
  "--text-xs",
  "--leading-normal",
  "--tracking-wide",
  "--radius-sm",
  "--radius-full",
  "--radius-card",
  "--radius-panel",
  "--gutter",
  "--width-layout",
  "--grid-columns",
  "--ease-standard",
  "--duration-base",
  "--motion-distance-lg",
  "--v-status-new",
  "--text-body",
  "--text-link",
  "--text-danger",
  "--text-success",
  "--border-danger",
  "--border-accent",
  "--accent",
  "--accent-fill",
  "--accent-fill-fg",
  "--pill-new-start",
  "--pill-new-fg",
  "--pill-new-glow",
  "--btn-fill-end",
  "--btn-highlight",
  "--btn-rim",
  "--focus-ring",
  "--surface-band",
  "--scroll-shade",
  "--surface-chrome",
];

describe("tokens.css", () => {
  it("declares every shared token", () => {
    expect(SHARED_TOKENS.filter((name) => !declared.has(name))).toEqual([]);
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

  it("binds headings to the display font", () => {
    const headings = blocks.find((block) => block.selector.startsWith("h1,"));
    expect(headings?.selector).toBe("h1, h2, h3, h4, h5, h6");
  });
});
