import { readdirSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DefaultThemeMeta } from "@/components/default-theme-meta";
import { docsStylesheetRules, rulesFor } from "@/lib/stylesheet-rules";
import {
  contrast,
  luminance,
  resolve,
  rgb,
  rootDeclarations,
  themeTokens,
} from "@/test-support/contrast";
import {
  DEFAULT_THEME,
  embed,
  nextTheme,
  THEME_COLORS,
  THEME_STORAGE_KEY,
  THEMES,
  themeName,
} from "./theme";

const rules = docsStylesheetRules();

const FOCUSABLE = ":where(a[href], button, input, select, textarea, summary, [tabindex])";

const OUTLINE_TRANSITION_CLASS = /(?<![\w-])transition-(all|\[[^\]]*outline[^\]]*\])(?![\w-])/g;

function sourceFiles(directories: ReadonlyArray<string>): string[] {
  return directories.flatMap((directory) =>
    readdirSync(join(process.cwd(), directory), { recursive: true, encoding: "utf8" })
      .filter((file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file))
      .map((file) => join(process.cwd(), directory, file)),
  );
}

function declarationsOf(selector: string): Record<string, string> {
  return rootDeclarations(rules, selector);
}

const { dark: DARK, light: LIGHT } = themeTokens(rules);

async function githubLightPalette(): Promise<string[]> {
  const core = realpathSync(join(process.cwd(), "node_modules/fumadocs-core"));
  const shiki = realpathSync(join(dirname(core), "shiki"));
  const themes = realpathSync(join(dirname(shiki), "@shikijs/themes"));
  const module = await import(pathToFileURL(join(themes, "dist/github-light.mjs")).href);
  const theme = module.default as {
    colors: Record<string, string>;
    tokenColors?: Array<{ settings?: { foreground?: string; background?: string } }>;
    settings?: Array<{ settings?: { foreground?: string; background?: string } }>;
  };
  const found = new Set<string>();
  for (const entry of theme.tokenColors ?? theme.settings ?? []) {
    const color = entry.settings?.background ? undefined : entry.settings?.foreground;
    if (color && /^#[0-9a-f]{6}$/i.test(color)) found.add(color.toUpperCase());
  }
  return [...found];
}

const LIGHT_PALETTE = await githubLightPalette();

function effectiveLightColor(original: string): string {
  const override = rules.find(
    (rule) =>
      rule.selector.startsWith(".light .shiki span[style*=") &&
      rule.selector.toUpperCase().includes(original) &&
      rule.declarations.color,
  );
  return (override?.declarations.color ?? original).replace(/\s*!important$/, "");
}

const TEXT_PAIRS = [
  ["--text-strong", "--surface-bg"],
  ["--text-body", "--surface-card"],
  ["--text-muted", "--surface-bg"],
  ["--text-muted", "--surface-card"],
  ["--text-faint", "--surface-bg"],
  ["--text-faint", "--surface-card"],
  ["--accent", "--surface-bg"],
  ["--accent", "--v-void"],
  ["--accent", "--surface-card"],
  ["--text-danger", "--surface-bg"],
  ["--v-status-changed", "--v-void"],
  ["--v-status-unchanged", "--v-void"],
  ["--accent-fill-fg", "--accent-fill"],
  ["--pill-new-fg", "--pill-new-start"],
  ["--pill-new-fg", "--pill-new-end"],
  ["--color-fd-primary-foreground", "--color-fd-primary"],
] as const;

type Tint = readonly [string, readonly [number, number, number], number];

const FUMADOCS_DIFF_ADD: Tint = ["diff-add", [14, 180, 100], 0.1];

const FUMADOCS_DIFF_REMOVE: Tint = ["diff-remove", [200, 10, 100], 0.12];

function overlay(tint: Tint[1], alpha: number, base: string): string {
  const under = rgb(base);
  return `#${tint
    .map((channel, index) =>
      Math.round(channel * alpha + (under[index] ?? 0) * 255 * (1 - alpha))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

const UI_PAIRS = [
  ["--focus-ring", "--surface-bg"],
  ["--focus-ring", "--v-void"],
] as const;

describe("theme defaults", () => {
  it("defaults to dark and keeps the choice under one storage key", () => {
    expect(DEFAULT_THEME).toBe("dark");
    expect(THEME_STORAGE_KEY).toBe("theme");
  });

  it("toggles between the two themes", () => {
    expect(nextTheme("dark")).toBe("light");
    expect(nextTheme("light")).toBe("dark");
    expect(nextTheme(undefined)).toBe("light");
  });

  it("reads anything but light as the dark default", () => {
    expect(themeName("light")).toBe("light");
    expect(themeName("dark")).toBe("dark");
    expect(themeName("system")).toBe(DEFAULT_THEME);
    expect(themeName(undefined)).toBe(DEFAULT_THEME);
  });

  it("has a browser chrome color for every theme", () => {
    for (const theme of THEMES) expect(THEME_COLORS[theme]).toMatch(/^#[0-9A-F]{6}$/);
  });
});

describe("theme tokens", () => {
  it("defaults the stylesheet to the dark scheme and switches on html.light", () => {
    expect(DARK["color-scheme"]).toBe("dark");
    expect(LIGHT["color-scheme"]).toBe("light");
  });

  it("gives a visitor without JavaScript the dark surface as the one theme-color", () => {
    const markup = renderToStaticMarkup(createElement(DefaultThemeMeta));
    const colors = [...markup.matchAll(/<meta name="theme-color"([^>]*)\/>/g)].map(
      (match) => match[1] ?? "",
    );
    expect(colors).toHaveLength(1);
    expect(colors[0]).not.toContain("media=");
    const content = /content="([^"]+)"/.exec(colors[0] ?? "")?.[1] ?? "";
    expect(markup).toContain(`<meta name="color-scheme" content="${DARK["color-scheme"]}"/>`);
    const surface = rgb(resolve(DARK, "var(--surface-bg)")).map((channel) => channel * 255);
    rgb(content).forEach((channel, index) => {
      expect(Math.abs(channel * 255 - (surface[index] ?? 0))).toBeLessThanOrEqual(1);
    });
  });

  it("gives the light theme its own value for every Fumadocs color and brand primitive", () => {
    const light = declarationsOf("html.light");
    const themed = Object.keys(DARK).filter(
      (name) =>
        /^--color-fd-(background|card|popover|muted|border|foreground|muted-foreground|accent|accent-foreground|primary-foreground)$/.test(
          name,
        ) || /^--v-(purple|glow|violet|void|danger|status-changed|status-unchanged)$/.test(name),
    );
    expect(themed.length).toBeGreaterThan(15);
    for (const name of themed) expect(light, name).toHaveProperty(name);
  });

  it.each([
    ["dark", DARK],
    ["light", LIGHT],
  ] as const)("keeps every text pair at WCAG AA (4.5:1) in the %s theme", (_theme, tokens) => {
    for (const [fg, bg] of TEXT_PAIRS) {
      expect(contrast(tokens, fg, bg), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it.each([
    ["dark", DARK],
    ["light", LIGHT],
  ] as const)("keeps the focus ring at 3:1 against the page in the %s theme", (_theme, tokens) => {
    for (const [fg, bg] of UI_PAIRS) {
      expect(contrast(tokens, fg, bg), `${fg} on ${bg}`).toBeGreaterThanOrEqual(3);
    }
  });

  it.each([
    ["dark", DARK],
    ["light", LIGHT],
  ] as const)(
    "raises shiki comment tokens to WCAG AA on every code surface in the %s theme",
    (theme, tokens) => {
      const color = rulesFor(rules, `.${theme} .shiki span[style*="#6A737D" i]`)[0]?.declarations
        .color;
      if (!color) throw new Error(`no ${theme} comment override`);
      const comment = luminance(color.replace(/\s*!important$/, ""));
      for (const surface of ["--surface-bg", "--surface-card", "--color-fd-muted", "--v-void"]) {
        const background = luminance(resolve(tokens, `var(${surface})`));
        const ratio =
          (Math.max(comment, background) + 0.05) / (Math.min(comment, background) + 0.05);
        expect(ratio, `${theme} comment on ${surface}`).toBeGreaterThanOrEqual(4.5);
      }
    },
  );

  it("keeps every github-light token color at WCAG AA on every code surface and line tint", () => {
    const highlight = rulesFor(rules, ".shiki:not(.not-fumadocs-codeblock *) .highlighted")[0]
      ?.declarations.background;
    if (!highlight) throw new Error("no highlighted-line tint");
    const diffTints = [FUMADOCS_DIFF_ADD, FUMADOCS_DIFF_REMOVE];
    expect(LIGHT_PALETTE.length).toBeGreaterThan(8);
    for (const original of LIGHT_PALETTE) {
      const token = luminance(effectiveLightColor(original));
      for (const surface of ["--surface-bg", "--surface-card", "--color-fd-muted", "--v-void"]) {
        const base = resolve(LIGHT, `var(${surface})`);
        const backgrounds = [
          [surface, base],
          [`highlighted on ${surface}`, resolve(LIGHT, highlight.replace("transparent", base))],
          ...diffTints.map(
            ([name, tint, alpha]) => [`${name} on ${surface}`, overlay(tint, alpha, base)] as const,
          ),
        ] as const;
        for (const [label, background] of backgrounds) {
          const surfaceLuminance = luminance(background);
          const ratio =
            (Math.max(token, surfaceLuminance) + 0.05) / (Math.min(token, surfaceLuminance) + 0.05);
          expect(ratio, `${original} on ${label}`).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });

  it("overrides a light token only through a selector that names its --shiki-light value", () => {
    const overrides = rules.filter((rule) =>
      rule.selector.startsWith(".light .shiki span[style*="),
    );
    expect(overrides.length).toBeGreaterThan(2);
    for (const rule of overrides) {
      expect(rule.selector, rule.selector).toMatch(/--shiki-light:#[0-9A-F]{6}|#6A737D/i);
    }
  });

  it("draws the matched text of the active search result in the fill's foreground, at AA in both themes", () => {
    const selector =
      '[role="dialog"]:has([role="combobox"]) [role="listbox"] [role="option"][aria-selected="true"] ::highlight(fd-search)';
    expect(rulesFor(rules, selector)[0]?.declarations.color).toBe("var(--accent-fill-fg)");
    for (const tokens of [DARK, LIGHT]) {
      expect(contrast(tokens, "--accent-fill-fg", "--accent-fill")).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("clears the code chip of the active search result so a match inside it stays at AA", () => {
    const chip = rules.find(
      (rule) =>
        rule.selector.includes('[aria-selected="true"] code') &&
        rule.selector.includes('[role="dialog"]:has([role="combobox"])'),
    );
    expect(chip?.declarations.background).toBe("transparent");
    expect(chip?.declarations.color).toBe("var(--accent-fill-fg)");
    for (const tokens of [DARK, LIGHT]) {
      expect(contrast(tokens, "--accent-fill-fg", "--accent-fill")).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("keeps a callout lead word at AA on its own tint, for both callout colors in both themes", () => {
    for (const tokens of [DARK, LIGHT]) {
      for (const color of ["--color-fd-info", "--color-fd-warning"]) {
        const lead = luminance(resolve(tokens, `var(${color})`));
        const [red = 0, green = 0, blue = 0] = rgb(resolve(tokens, `var(${color})`));
        const tint = luminance(
          overlay([red * 255, green * 255, blue * 255], 0.09, resolve(tokens, "var(--surface-bg)")),
        );
        const ratio = (Math.max(lead, tint) + 0.05) / (Math.min(lead, tint) + 0.05);
        expect(ratio, `${color} lead word on its tint`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("measures the diff tints Fumadocs ships", () => {
    const css = readFileSync(
      join(process.cwd(), "node_modules/fumadocs-ui/dist/style.css"),
      "utf8",
    );
    for (const [name, [red, green, blue], alpha] of [FUMADOCS_DIFF_ADD, FUMADOCS_DIFF_REMOVE])
      expect(css).toContain(`--color-fd-${name}: rgba(${red}, ${green}, ${blue}, ${alpha});`);
  });

  it("derives the accent border from the accent and the default border, in one token", () => {
    expect(DARK["--border-accent"]).toBe(
      "color-mix(in srgb, var(--accent) 45%, var(--border-default))",
    );
    expect(declarationsOf("html.light")).not.toHaveProperty("--border-accent");
  });

  it("styles components through the semantic layer, never the Fumadocs or brand primitives", () => {
    const primitive =
      /(?<![\w-])(?:text|bg|border|divide|decoration|ring|outline|fill|stroke)-fd-[\w-]+|var\(--color-fd-[\w-]+\)|\(--v-(?!void\)|status-)[\w-]+\)/g;
    const offenders = sourceFiles(["components", "app"]).flatMap((file) =>
      Array.from(readFileSync(file, "utf8").matchAll(primitive), (match) => [
        relative(process.cwd(), file),
        match[0],
      ]),
    );
    expect(offenders).toEqual([]);
  });

  it("spells every token utility in the (--token) shorthand, never as an arbitrary var() value", () => {
    const bracketed = /[\w\]-]-\[(?:color:)?var\(--[\w-]+\)\]/g;
    const offenders = sourceFiles(["components", "app", "lib"]).flatMap((file) =>
      Array.from(readFileSync(file, "utf8").matchAll(bracketed), (match) => [
        relative(process.cwd(), file),
        match[0],
      ]),
    );
    expect(offenders).toEqual([]);
  });

  it("keeps the accent a single violet hue in both themes", () => {
    for (const tokens of [DARK, LIGHT]) {
      expect(resolve(tokens, "var(--accent)")).toMatch(/^hsl\(258 /);
      expect(resolve(tokens, "var(--accent-fill)")).toMatch(/^hsl\(258 /);
    }
  });

  it("hides the icon of the theme that is not showing", () => {
    expect(rulesFor(rules, ".vk-theme-icon-light")[0]?.declarations.display).toBe("none");
    expect(rulesFor(rules, "html.light .vk-theme-icon-dark")[0]?.declarations.display).toBe("none");
    expect(rulesFor(rules, "html.light .vk-theme-icon-light")[0]?.declarations.display).toBe(
      "block",
    );
  });

  it("draws every focus ring in --focus-ring at once, never fading it in, and leaves every other transition alone", () => {
    expect(rulesFor(rules, ":focus-visible")[0]?.declarations.outline).toBe(
      "2px solid var(--focus-ring)",
    );
    const resting = rules.filter(
      (rule) => rule.declarations["outline-color"] && !rule.selector.includes(":focus"),
    );
    expect(
      resting.map((rule) => [rule.media, rule.selector, rule.declarations["outline-color"]]),
    ).toEqual([["@layer base", FOCUSABLE, "var(--focus-ring)"]]);
    const focusTransitions = rules.filter(
      (rule) =>
        rule.selector.includes(":focus-visible") && rule.declarations["transition-property"],
    );
    expect(focusTransitions).toEqual([]);
  });

  it("never transitions an outline's width or offset, so a ring never grows in, even under reduced motion", () => {
    const outlineTransitions = rules.filter((rule) =>
      ["transition", "transition-property"].some((property) =>
        /\b(all|outline(-width|-offset)?)\b/.test(rule.declarations[property] ?? ""),
      ),
    );
    expect(outlineTransitions).toEqual([]);
    const offenders = sourceFiles(["components", "lib", "app"]).flatMap((file) =>
      Array.from(readFileSync(file, "utf8").matchAll(OUTLINE_TRANSITION_CLASS), (match) => [
        relative(process.cwd(), file),
        match[0],
      ]),
    );
    expect(offenders).toEqual([]);
  });

  it("keeps both shadows neutral in both themes, so the page carries no violet haze", () => {
    for (const tokens of [DARK, LIGHT]) {
      for (const shadow of ["--shadow-panel", "--shadow-sm"]) {
        const value = tokens[shadow] ?? "";
        expect(value).toMatch(/rgba\((0, 0, 0|20, 20, 40), 0?\.\d+\)/);
        expect(value).not.toMatch(/var\(--v-|hsl\(/);
      }
    }
    expect(LIGHT["--shadow-panel"]).not.toBe(DARK["--shadow-panel"]);
  });

  it("never hyphenates a heading on its own, yet lets a long word shrink its flex or grid track", () => {
    const heading = rules.find(
      (rule) => rule.selector.includes(".vk-h2") && "hyphens" in rule.declarations,
    );
    expect(heading?.declarations.hyphens).toBe("manual");
    expect(heading?.declarations["overflow-wrap"]).toBe("anywhere");
    expect(rules.some((rule) => rule.declarations.hyphens === "auto")).toBe(false);
  });
});

describe("embed", () => {
  it("escapes the characters that could end or break an inline script", () => {
    const embedded = embed("</script>\u2028\u2029");
    expect(embedded).toBe('"\\u003c/script>\\u2028\\u2029"');
    expect(JSON.parse(embedded)).toBe("</script>\u2028\u2029");
  });
});
