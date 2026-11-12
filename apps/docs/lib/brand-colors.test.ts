import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolve, themeTokens } from "@/test-support/contrast";
import {
  BRAND_SURFACES,
  BRAND_THEMES,
  brandColorCss,
  brandColorThemes,
  brandMarkClass,
  contrastOn,
  MIN_BRAND_CONTRAST,
} from "./brand-colors";
import { BRAND_MARK_IDS, BRAND_MARKS } from "./brand-marks";

const GENERATED = join(import.meta.dirname, "../app/brand-colors.generated.css");
const GLOBAL_CSS = readFileSync(join(import.meta.dirname, "../app/global.css"), "utf8");

describe("brand mark colours", () => {
  it("gives every mark one hex and a recorded source", () => {
    for (const id of BRAND_MARK_IDS) {
      const { hex, source } = BRAND_MARKS[id].color;
      expect(hex, id).toMatch(/^#[0-9A-F]{6}$/);
      expect(source.length, id).toBeGreaterThan(20);
      expect(source, id).toMatch(/Simple Icons 16\.35\.0|Lobe Icons|brand guidelines/);
    }
  });

  it("keeps one mark per brand, so a brand has exactly one hex", () => {
    const titles = BRAND_MARK_IDS.map((id) => BRAND_MARKS[id].title);
    expect(new Set(titles).size).toBe(titles.length);
  });
});

describe("the per-theme contrast rule", () => {
  it("measures the surfaces the marks sit on against the resolved tokens", () => {
    const tokens = themeTokens();
    for (const theme of BRAND_THEMES) {
      const resolved = ["--surface-page", "--surface-card"].map((name) =>
        resolve(tokens[theme], `var(${name})`),
      );
      expect(resolved, theme).toEqual([...BRAND_SURFACES[theme]]);
    }
  });

  it("colours a mark in a theme only when it reaches 3:1 on every surface of that theme", () => {
    for (const id of BRAND_MARK_IDS) {
      const { hex } = BRAND_MARKS[id].color;
      const themes = brandColorThemes(id);
      for (const theme of BRAND_THEMES) {
        const holds = BRAND_SURFACES[theme].every(
          (surface) => contrastOn(hex, surface) >= MIN_BRAND_CONTRAST,
        );
        expect(themes.includes(theme), `${id} ${theme}`).toBe(holds);
      }
    }
  });

  it("falls back to the neutral colour where a black or near-black mark meets the dark theme", () => {
    for (const id of ["deviconNextjs", "fontawesomeApple", "openai", "simpleOpencode"] as const) {
      expect(brandColorThemes(id)).toEqual(["light"]);
    }
  });

  it("keeps every mark visible somewhere: a colour in a theme or the neutral text colour", () => {
    const neutral = themeTokens();
    for (const theme of BRAND_THEMES) {
      const muted = resolve(neutral[theme], "var(--text-muted)");
      expect(muted.length).toBeGreaterThan(0);
    }
    expect(contrastOn("#000000", BRAND_SURFACES.dark[0] ?? "")).toBeLessThan(MIN_BRAND_CONTRAST);
    expect(contrastOn("#000000", BRAND_SURFACES.light[0] ?? "")).toBeGreaterThan(
      MIN_BRAND_CONTRAST,
    );
  });
});

describe("the generated stylesheet", () => {
  const css = brandColorCss();

  it("holds one rule per mark and colouring theme, on the theme class of <html>, with no inline style", () => {
    const rules = [
      ...css.matchAll(/html\.(dark|light) \.(vk-brand-\w+) \{\n {2}color: (#[0-9A-F]{6});\n\}/g),
    ];
    const expected = BRAND_MARK_IDS.flatMap((id) =>
      brandColorThemes(id).map(
        (theme) => `${theme} ${brandMarkClass(id)} ${BRAND_MARKS[id].color.hex}`,
      ),
    );
    expect(rules.map((rule) => `${rule[1]} ${rule[2]} ${rule[3]}`)).toEqual(expected);
  });

  it("is committed in step with the data and imported by global.css", () => {
    expect(readFileSync(GENERATED, "utf8")).toBe(css);
    expect(GLOBAL_CSS).toContain('@import "./brand-colors.generated.css";');
  });
});
