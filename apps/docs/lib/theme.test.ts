import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
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
  ["--color-fd-primary-foreground", "--color-fd-primary"],
] as const;

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
        ) ||
        /^--v-(purple|glow|glow-soft|violet|void|danger|status-changed|status-unchanged)$/.test(
          name,
        ),
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

  it("derives the accent border from the accent and the default border, in one token", () => {
    expect(DARK["--border-accent"]).toBe(
      "color-mix(in srgb, var(--accent) 45%, var(--border-default))",
    );
    expect(declarationsOf("html.light")).not.toHaveProperty("--border-accent");
  });

  it("styles components through the semantic layer, never the Fumadocs or brand primitives", () => {
    const primitive =
      /(?<![\w-])(?:text|bg|border|divide|decoration|ring|outline|fill|stroke)-fd-[\w-]+|var\(--color-fd-[\w-]+\)|\(--v-(?!void\)|status-|glow-soft\))[\w-]+\)/g;
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

  it("keeps both shadows neutral in both themes, leaving the hero glow the only violet haze", () => {
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
