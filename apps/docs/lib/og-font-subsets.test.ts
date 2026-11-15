import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { OG_FONT_DIR, OG_FONT_FILES, ogFontFilesFor } from "./og-fonts";
import { OG_LOCALE_FONTS, type OgLocaleFont } from "./og-locale-fonts";
import { buildOgFontSubsets, localesWithOgFonts, subsetOgFont } from "./og-subset";
import { ogCharacters, ogTexts } from "./og-texts";
import { fontCodePoints, fontTableTags, missingGlyphs } from "./ttf-coverage";

const FONT_ROOT = join(process.cwd(), OG_FONT_DIR);
const BOLD = readFileSync(join(FONT_ROOT, "Geist-Bold.ttf"));
const CJK_WORD = "翻译";

function withTables(font: Buffer, extra: Readonly<Record<string, Buffer>>): Buffer {
  const count = font.readUInt16BE(4);
  const tables = Array.from({ length: count }, (_, index) => {
    const record = 12 + index * 16;
    const offset = font.readUInt32BE(record + 8);
    return {
      tag: font.toString("latin1", record, record + 4),
      data: font.subarray(offset, offset + font.readUInt32BE(record + 12)),
    };
  });
  for (const [tag, data] of Object.entries(extra)) tables.push({ tag, data });
  tables.sort((a, b) => (a.tag < b.tag ? -1 : 1));
  const directory = Buffer.alloc(12 + tables.length * 16);
  font.copy(directory, 0, 0, 12);
  directory.writeUInt16BE(tables.length, 4);
  let offset = directory.length;
  const bodies: Buffer[] = [];
  tables.forEach((table, index) => {
    const record = 12 + index * 16;
    directory.write(table.tag, record, "latin1");
    directory.writeUInt32BE(offset, record + 8);
    directory.writeUInt32BE(table.data.length, record + 12);
    const padding = Buffer.alloc((4 - (table.data.length % 4)) % 4);
    bodies.push(table.data, padding);
    offset += table.data.length + padding.length;
  });
  return Buffer.concat([directory, ...bodies]);
}

const EMPTY_LAYOUT_TABLE = Buffer.from([0, 1, 0, 0, 0, 10, 0, 12, 0, 14, 0, 0, 0, 0, 0, 0]);
const LAYOUT_TAGS = ["GPOS", "GSUB", "kern"];

function fixtureFont(file: string): OgLocaleFont {
  return { name: "Fixture", file, weight: 700, lang: undefined, sourceFile: "Geist-Bold.ttf" };
}

describe("font glyph coverage", () => {
  it("reads the characters a font draws, and none it lacks", () => {
    const covered = fontCodePoints(BOLD);
    expect(covered.has("A".codePointAt(0) ?? 0)).toBe(true);
    expect(covered.has("é".codePointAt(0) ?? 0)).toBe(true);
    expect(covered.has(CJK_WORD.codePointAt(0) ?? 0)).toBe(false);
  });

  it("names the characters no font in the set covers", () => {
    expect(missingGlyphs(`Verbatra${CJK_WORD}`, [BOLD])).toEqual([...CJK_WORD]);
    expect(missingGlyphs("Verbatra", [BOLD])).toEqual([]);
  });
});

describe("OG font subsets", () => {
  it("keeps only the requested characters, and strips layout tables like the committed fonts", async () => {
    const subset = await subsetOgFont(BOLD, "é", {});
    const covered = fontCodePoints(subset);
    expect(covered.has("é".codePointAt(0) ?? 0)).toBe(true);
    expect(covered.has("ü".codePointAt(0) ?? 0)).toBe(false);
    expect(covered.has("A".codePointAt(0) ?? 0)).toBe(true);
  });

  it("strips the layout tables a source font carries", async () => {
    const source = withTables(BOLD, {
      GPOS: EMPTY_LAYOUT_TABLE,
      GSUB: EMPTY_LAYOUT_TABLE,
      kern: Buffer.from([0, 0, 0, 0]),
    });
    for (const tag of LAYOUT_TAGS) expect(fontTableTags(source)).toContain(tag);
    const subset = await subsetOgFont(source, "é", {});
    for (const tag of LAYOUT_TAGS) expect(fontTableTags(subset)).not.toContain(tag);
  });

  describe("built into a project root", () => {
    const roots: string[] = [];

    afterEach(() => {
      for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
    });

    function project(headline: string, frontmatter: string): string {
      const root = mkdtempSync(join(tmpdir(), "og-subsets-"));
      roots.push(root);
      mkdirSync(join(root, "messages"));
      mkdirSync(join(root, "content/docs"), { recursive: true });
      writeFileSync(
        join(root, "messages/en.json"),
        JSON.stringify({ landing: { banner: { headline } }, compare: { heading: "Compare" } }),
      );
      writeFileSync(join(root, "content/docs/index.mdx"), `---\n${frontmatter}\n---\n\nBody\n`);
      return root;
    }

    const table = { ...OG_LOCALE_FONTS, "zh-CN": [], en: [fixtureFont("Fixture.ttf")] };

    it("collects the headline, the compare heading and the page frontmatter", () => {
      const root = project("<accent>Ship é</accent> fast", "title: Start\ndescription: Über uns");
      expect(ogTexts("en", root)).toEqual(["Ship é fast", "Compare", "Start", "Über uns"]);
    });

    it("writes a subset that covers every character the locale's images can draw", async () => {
      const root = project("Ship é", "title: Start\ndescription: Über uns");
      const [written] = await buildOgFontSubsets({ root, sourceDir: FONT_ROOT, table });
      expect(written).toBe(join(root, OG_FONT_DIR, "Fixture.ttf"));
      const subset = readFileSync(written ?? "");
      expect(missingGlyphs(ogCharacters(ogTexts("en", root)), [subset])).toEqual([]);
      expect(fontCodePoints(subset).has("ö".codePointAt(0) ?? 0)).toBe(false);
    });

    it("reports the characters a subset lacks once the text gains one", async () => {
      const root = project("Ship é", "title: Start");
      const [written] = await buildOgFontSubsets({ root, sourceDir: FONT_ROOT, table });
      writeFileSync(join(root, "content/docs/index.mdx"), `---\ntitle: Start ${CJK_WORD}\n---\n`);
      const subset = readFileSync(written ?? "");
      expect(missingGlyphs(ogCharacters(ogTexts("en", root)), [subset])).toEqual([...CJK_WORD]);
    });
  });

  it("covers every character the locale's images can draw, for each locale with an extra font", () => {
    expect(localesWithOgFonts()).toContain("zh-CN");
    for (const locale of localesWithOgFonts()) {
      const fonts = ogFontFilesFor(locale).map((file) => readFileSync(join(FONT_ROOT, file)));
      const characters = ogCharacters(ogTexts(locale, process.cwd()));
      expect(missingGlyphs(characters, fonts), locale).toEqual([]);
    }
  });

  it("ships no extra font for a locale until its table entry exists", () => {
    expect(ogFontFilesFor("en")).toEqual(OG_FONT_FILES.map((font) => font.file));
  });

  it("lists zh-CN as the only locale with an extra font, a Medium and a Bold instance", () => {
    expect(localesWithOgFonts()).toEqual(["zh-CN"]);
    expect(OG_LOCALE_FONTS["zh-CN"].map((font) => font.weight)).toEqual([500, 700]);
    expect(ogFontFilesFor("zh-CN")).toEqual([
      ...OG_FONT_FILES.map((font) => font.file),
      "NotoSansSC-Medium.ttf",
      "NotoSansSC-Bold.ttf",
    ]);
  });

  it("asks for the source font directory when a locale configures an extra font", () => {
    const result = spawnSync(process.execPath, ["scripts/build-og-font-subsets.mjs"], {
      cwd: process.cwd(),
      encoding: "utf8",
    });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("--source-dir");
    expect(result.stderr).toContain("zh-CN");
  });

  it("does nothing, and says so, while no locale configures an extra font", async () => {
    const none = { ...OG_LOCALE_FONTS, "zh-CN": [] };
    expect(localesWithOgFonts(none)).toEqual([]);
    expect(
      await buildOgFontSubsets({ root: process.cwd(), sourceDir: FONT_ROOT, table: none }),
    ).toEqual([]);
  });
});
