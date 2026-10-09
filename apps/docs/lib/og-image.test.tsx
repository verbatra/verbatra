import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import de from "../messages/de.json";
import en from "../messages/en.json";
import es from "../messages/es.json";
import fr from "../messages/fr.json";
import { HERO_HEADLINES, heroLocaleRows } from "./hero-lines";
import { i18n } from "./i18n";
import { HERO_NUMBERS } from "./landing-facts";
import { loadOgFonts, OG_FONT_DIR, OG_FONT_FILES } from "./og-fonts";
import { gutterOffset, HomeOgFrame, OG_FONT, OG_PALETTE, titleFontSize } from "./og-image";
import { SITE_URL } from "./site";

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

describe("HomeOgFrame", () => {
  const markup = renderToStaticMarkup(
    <HomeOgFrame
      headline={{ locale: "en", text: HERO_HEADLINES.en }}
      rows={heroLocaleRows("en").map((row) => ({ locale: row.locale, text: row.headline }))}
      numbers={[{ label: "file formats", value: "14" }]}
      footer="verbatra.kreitz-webdev.de"
    />,
  );

  it("draws the living headline: the source line, then the de and fr rows under locale codes", () => {
    const en = markup.indexOf(HERO_HEADLINES.en);
    const de = markup.indexOf(HERO_HEADLINES.de);
    const fr = markup.indexOf(HERO_HEADLINES.fr);
    expect(en).toBeGreaterThan(-1);
    expect(de).toBeGreaterThan(en);
    expect(fr).toBeGreaterThan(de);
    expect(markup).toContain(">de</div>");
    expect(markup).toContain(">fr</div>");
  });

  it("balances a wrapping headline, so a long one never leaves a single word on its last line", () => {
    expect(markup).toContain("text-wrap:balance");
  });

  it("sits on the flat void page, with no wash gradient", () => {
    expect(markup).toContain(`background:${OG_PALETTE.void}`);
    expect(markup).not.toContain("radial-gradient");
  });

  it("ends on the big numbers and the host, not a facts table", () => {
    expect(markup).toContain("file formats");
    expect(markup).toContain(">14</div>");
    expect(markup).toContain("verbatra.kreitz-webdev.de");
  });
});

describe("OG_PALETTE", () => {
  const css = readFileSync(join(process.cwd(), "app/global.css"), "utf8");
  const token = (name: string) =>
    new RegExp(`${name}: hsl\\(([^)]+)\\);`).exec(css)?.[1]?.split(" ").join(", ");

  it.each([
    ["void", "--v-void"],
    ["background", "--color-fd-background"],
    ["strong", "--color-fd-foreground"],
    ["muted", "--color-fd-muted-foreground"],
    ["faint", "--text-faint"],
    ["glow", "--v-glow"],
    ["purple", "--v-purple"],
  ] as const)("mirrors %s from the %s token in global.css", (key, name) => {
    expect(OG_PALETTE[key]).toBe(`hsl(${token(name)})`);
  });
});

describe("gutterOffset", () => {
  it("centres the locale code on the first line of the text beside it", () => {
    expect(gutterOffset({ size: 68, leading: 1.04 })).toBe(24);
    expect(gutterOffset({ size: 34, leading: 1.3 })).toBe(11);
  });
});

describe("OG fonts", () => {
  function tableTags(file: string): ReadonlyArray<string> {
    const data = readFileSync(join(process.cwd(), OG_FONT_DIR, file));
    const count = data.readUInt16BE(4);
    return Array.from({ length: count }, (_, index) =>
      data.toString("latin1", 12 + index * 16, 16 + index * 16),
    );
  }

  it.each(OG_FONT_FILES.map((font) => font.file))(
    "%s carries no kerning tables, which satori measures and draws inconsistently into doubled word gaps",
    (file) => {
      const tags = tableTags(file);
      expect(tags).toContain("glyf");
      for (const tag of ["GPOS", "GSUB", "kern"]) expect(tags).not.toContain(tag);
    },
  );

  it("loads the site's display face at 500 and 700 and its mono face", async () => {
    const fonts = await loadOgFonts();
    expect(fonts.map((font) => [font.name, font.weight])).toEqual([
      [OG_FONT.display, 500],
      [OG_FONT.display, 700],
      [OG_FONT.mono, 400],
    ]);
    expect(fonts.every((font) => font.data.byteLength > 0)).toBe(true);
  });

  it("ships the font files with the home-og route in the standalone build", () => {
    const config = readFileSync(join(process.cwd(), "next.config.mjs"), "utf8");
    expect(config).toContain(`"/[lang]/home-og": ["./${OG_FONT_DIR}/*.ttf"]`);
  });
});

describe("OG font coverage", () => {
  function codePoints(file: string): ReadonlySet<number> {
    const data = readFileSync(join(process.cwd(), OG_FONT_DIR, file));
    const tables = data.readUInt16BE(4);
    let cmap = 0;
    for (let index = 0; index < tables; index += 1) {
      const record = 12 + index * 16;
      if (data.toString("latin1", record, record + 4) === "cmap")
        cmap = data.readUInt32BE(record + 8);
    }
    const covered = new Set<number>();
    const subtables = data.readUInt16BE(cmap + 2);
    for (let index = 0; index < subtables; index += 1) {
      const offset = cmap + data.readUInt32BE(cmap + 4 + index * 8 + 4);
      if (data.readUInt16BE(offset) === 4) readFormat4(data, offset, covered);
    }
    return covered;
  }

  function readFormat4(data: Buffer, offset: number, covered: Set<number>): void {
    const segments = data.readUInt16BE(offset + 6) / 2;
    const ends = offset + 14;
    const starts = ends + segments * 2 + 2;
    const deltas = starts + segments * 2;
    const ranges = deltas + segments * 2;
    for (let segment = 0; segment < segments; segment += 1) {
      const start = data.readUInt16BE(starts + segment * 2);
      const end = data.readUInt16BE(ends + segment * 2);
      const delta = data.readInt16BE(deltas + segment * 2);
      const rangeAt = ranges + segment * 2;
      const range = data.readUInt16BE(rangeAt);
      for (let code = start; code <= end && code !== 0xffff; code += 1) {
        const glyph =
          range === 0
            ? (code + delta) & 0xffff
            : data.readUInt16BE(rangeAt + range + (code - start) * 2);
        if (glyph !== 0) covered.add(code);
      }
    }
  }

  const catalogs = { en, de, es, fr } as const;
  const drawn = [
    ...Object.values(HERO_HEADLINES),
    ...i18n.languages.flatMap((locale) => Object.values(catalogs[locale].landing.hero.numbers)),
    ...HERO_NUMBERS.map((number) => String(number.value)),
    ...i18n.languages,
    new URL(SITE_URL).host,
    "VERBATRA",
  ].join("");
  const needed = [...new Set([...drawn].map((char) => char.codePointAt(0) ?? 0))].filter(
    (code) => code !== 0x20,
  );

  it.each(OG_FONT_FILES.map((font) => font.file))(
    "%s has a glyph for every character the home image draws",
    (file) => {
      const covered = codePoints(file);
      const missing = needed.filter((code) => !covered.has(code));
      expect(missing.map((code) => String.fromCodePoint(code))).toEqual([]);
    },
  );
});
