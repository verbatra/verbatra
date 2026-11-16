import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { stripAccentTags } from "@/test-support/accent-tags";
import en from "../messages/en.json";
import {
  HERO_CHECK_COMMAND,
  HERO_OG_LINES,
  HERO_TERMINAL_SCRIPT,
  HERO_TRANSLATE_COMMAND,
} from "./hero-terminal";
import { LOCALES } from "./locales";
import { loadOgFonts, OG_FONT_DIR, OG_FONT_FILES } from "./og-fonts";
import {
  HomeOgFrame,
  OG_FONT,
  OG_PALETTE,
  OG_TERMINAL_PROMPT,
  OG_WORDMARK,
  OgFrame,
  titleFontSize,
} from "./og-image";
import { OG_LOCALE_FONTS } from "./og-locale-fonts";
import { ogTexts } from "./og-texts";
import { SITE_URL } from "./site";
import { uiTokensCss } from "./stylesheet-rules";
import { fontCodePoints, fontTableTags } from "./ttf-coverage";

describe("titleFontSize", () => {
  it("uses the largest size for a short title", () => {
    expect(titleFontSize("verbatra")).toBe(66);
  });

  it("keeps the largest size at the lower boundary", () => {
    expect(titleFontSize("a".repeat(44))).toBe(66);
  });

  it("drops to the medium size just past the lower boundary", () => {
    expect(titleFontSize("a".repeat(45))).toBe(54);
  });

  it("keeps the medium size at the upper boundary", () => {
    expect(titleFontSize("a".repeat(70))).toBe(54);
  });

  it("drops to the smallest size just past the upper boundary", () => {
    expect(titleFontSize("a".repeat(71))).toBe(44);
  });

  it("uses the smallest size for a very long title", () => {
    expect(titleFontSize("a".repeat(120))).toBe(44);
  });
});

const HEADLINE = stripAccentTags(en.landing.banner.headline);

describe("HomeOgFrame", () => {
  const markup = renderToStaticMarkup(
    <HomeOgFrame headline={HEADLINE} lines={HERO_OG_LINES} footer="verbatra.kreitz-webdev.de" />,
  );

  it("draws the landing headline above the real check and translate lines", () => {
    const headline = markup.indexOf(HEADLINE);
    const check = markup.indexOf(HERO_CHECK_COMMAND);
    const translate = markup.indexOf(HERO_TRANSLATE_COMMAND);
    expect(headline).toBeGreaterThan(-1);
    expect(check).toBeGreaterThan(headline);
    expect(translate).toBeGreaterThan(check);
  });

  it("takes every terminal line from the hero transcript, so it never claims output the CLI does not print", () => {
    const transcript = HERO_TERMINAL_SCRIPT.flatMap((step) => [step.command, ...step.output]);
    expect(HERO_OG_LINES.length).toBeGreaterThan(2);
    for (const line of HERO_OG_LINES) expect(transcript).toContain(line.text);
  });

  it("balances a wrapping headline, so a long one never leaves a single word on its last line", () => {
    expect(markup).toContain("text-wrap:balance");
  });

  it("sits on the flat void page in monochrome and violet, with no wash gradient", () => {
    expect(markup).toContain(`background:${OG_PALETTE.void}`);
    expect(markup).not.toContain("gradient");
    expect(markup).toContain(OG_PALETTE.glow);
  });

  it("names the host in the top bar", () => {
    expect(markup).toContain("verbatra.kreitz-webdev.de");
  });

  it("writes the wordmark in lowercase, as the header and footer do", () => {
    expect(OG_WORDMARK).toBe("verbatra");
    expect(markup).toContain(`>${OG_WORDMARK}</div>`);
    expect(markup).not.toMatch(/VERBATRA|text-transform:uppercase/);
  });
});

describe("OgFrame", () => {
  const markup = renderToStaticMarkup(
    <OgFrame
      title="Formats"
      description="Every supported format and what a write preserves."
      footer="verbatra.kreitz-webdev.de/docs/formats"
    />,
  );

  it("shares the home card's flat void page, wordmark and Geist faces, with no wash gradient", () => {
    expect(markup).toContain(`background:${OG_PALETTE.void}`);
    expect(markup).not.toContain("gradient");
    expect(markup).toContain(`>${OG_WORDMARK}</div>`);
    expect(markup).toContain(`font-family:${OG_FONT.display}`);
    expect(markup).toContain(`font-family:${OG_FONT.mono}`);
  });

  it("draws the page title above its description and names the page URL in the top bar", () => {
    const url = markup.indexOf("verbatra.kreitz-webdev.de/docs/formats");
    const title = markup.indexOf(">Formats</div>");
    const description = markup.indexOf("Every supported format");
    expect(url).toBeGreaterThan(-1);
    expect(title).toBeGreaterThan(url);
    expect(description).toBeGreaterThan(title);
  });

  it("leaves the description out when a page has none", () => {
    const bare = renderToStaticMarkup(<OgFrame title="Formats" footer="host" />);
    expect(bare).not.toContain("border-left");
  });
});

describe("OG_PALETTE", () => {
  const css = uiTokensCss();
  const token = (name: string) =>
    new RegExp(`${name}: hsl\\(([^)]+)\\);`).exec(css)?.[1]?.split(" ").join(", ");

  it.each([
    ["void", "--v-void"],
    ["background", "--surface-bg"],
    ["strong", "--text-strong"],
    ["muted", "--text-muted"],
    ["faint", "--text-faint"],
    ["glow", "--v-glow"],
    ["purple", "--v-purple"],
    ["border", "--border-default"],
  ] as const)("mirrors %s from the %s token in tokens.css", (key, name) => {
    expect(OG_PALETTE[key]).toBe(`hsl(${token(name)})`);
  });
});

describe("OG fonts", () => {
  it.each(OG_FONT_FILES.map((font) => font.file))(
    "%s carries no kerning tables, which satori measures and draws inconsistently into doubled word gaps",
    (file) => {
      const tags = fontTableTags(readFileSync(join(process.cwd(), OG_FONT_DIR, file)));
      expect(tags).toContain("glyf");
      for (const tag of ["GPOS", "GSUB", "kern"]) expect(tags).not.toContain(tag);
    },
  );

  it("loads the site's display face at 500 and 700 and its mono face", async () => {
    const fonts = await loadOgFonts("en");
    expect(fonts.map((font) => [font.name, font.weight])).toEqual([
      [OG_FONT.display, 500],
      [OG_FONT.display, 700],
      [OG_FONT.mono, 400],
    ]);
    expect(fonts.every((font) => font.data.byteLength > 0)).toBe(true);
  });

  it.each(["/[lang]/home-og", "/[lang]/docs-og/[[...slug]]"])(
    "ships the font files with the %s route in the standalone build",
    (route) => {
      const config = readFileSync(join(process.cwd(), "next.config.mjs"), "utf8");
      expect(config).toContain(`"${route}": ["./${OG_FONT_DIR}/*.ttf"]`);
    },
  );
});

describe("OG font coverage", () => {
  const latinLocales = LOCALES.filter((locale) => OG_LOCALE_FONTS[locale].length === 0);
  const drawn = [
    ...latinLocales.flatMap((locale) => ogTexts(locale, process.cwd())),
    ...HERO_OG_LINES.map((line) => line.text),
    OG_TERMINAL_PROMPT,
    new URL(SITE_URL).host,
    OG_WORDMARK,
  ].join("");
  const needed = [...new Set([...drawn].map((char) => char.codePointAt(0) ?? 0))].filter(
    (code) => code !== 0x20,
  );

  it.each(OG_FONT_FILES.map((font) => font.file))(
    "%s has a glyph for every character the home and docs images draw",
    (file) => {
      const covered = fontCodePoints(readFileSync(join(process.cwd(), OG_FONT_DIR, file)));
      const missing = needed.filter((code) => !covered.has(code));
      expect(missing.map((code) => String.fromCodePoint(code))).toEqual([]);
    },
  );
});
