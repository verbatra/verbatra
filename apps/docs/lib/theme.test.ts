import { describe, expect, it } from "vitest";
import { docsStylesheetRules, rulesFor } from "@/lib/stylesheet-rules";
import {
  DEFAULT_THEME,
  nextTheme,
  THEME_COLORS,
  THEME_PROVIDER_OPTIONS,
  THEMES,
  themeName,
} from "./theme";

const rules = docsStylesheetRules();

function declarationsOf(selector: string): Record<string, string> {
  return Object.assign(
    {},
    ...rulesFor(rules, selector)
      .filter((rule) => rule.media === "")
      .map((rule) => rule.declarations),
  );
}

const DARK = declarationsOf(":root");
const LIGHT = { ...DARK, ...declarationsOf("html.light") };

function resolve(tokens: Record<string, string>, value: string, depth = 0): string {
  const reference = /^var\((--[\w-]+)\)$/.exec(value.trim());
  if (!reference?.[1]) return value.trim();
  const next = tokens[reference[1]];
  if (next === undefined || depth > 8) throw new Error(`unresolved ${value}`);
  return resolve(tokens, next, depth + 1);
}

function rgb(value: string): [number, number, number] {
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

function luminance(value: string): number {
  const [r, g, b] = rgb(value).map((c) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
}

function contrast(tokens: Record<string, string>, foreground: string, background: string): number {
  const fg = luminance(resolve(tokens, `var(${foreground})`));
  const bg = luminance(resolve(tokens, `var(${background})`));
  return (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
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
  ["--color-fd-primary-foreground", "--color-fd-primary"],
] as const;

const UI_PAIRS = [
  ["--focus-ring", "--surface-bg"],
  ["--focus-ring", "--v-void"],
] as const;

describe("theme provider options", () => {
  it("defaults to dark, ignores the system preference and drops the single-key hotkey", () => {
    expect(DEFAULT_THEME).toBe("dark");
    expect(THEME_PROVIDER_OPTIONS).toMatchObject({
      defaultTheme: "dark",
      enableSystem: false,
      hotKey: false,
      themes: ["dark", "light"],
    });
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

  it("draws every header and phone menu focus ring in --focus-ring at once, never fading it in from the text color", () => {
    expect(rulesFor(rules, ":focus-visible")[0]?.declarations.outline).toBe(
      "2px solid var(--focus-ring)",
    );
    for (const selector of [".vk-header :focus-visible", ".vk-nav-sheet :focus-visible"]) {
      const transition = rulesFor(rules, selector)[0]?.declarations["transition-property"] ?? "";
      expect(transition).not.toBe("");
      expect(transition).not.toMatch(/outline|all/);
    }
  });
});
