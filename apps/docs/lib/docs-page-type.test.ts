import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { i18n } from "./i18n";
import {
  LOOKUP_REFERENCE_CEILING,
  LOOKUP_REFERENCE_PAGES,
  PAGE_TYPES,
  type PageType,
  proseWords,
} from "./page-type";

const CONTENT_DIR = join(import.meta.dirname, "../content/docs");
const GUIDES_META = join(CONTENT_DIR, "(guides)/meta.json");
const FRONTMATTER = /^---\n([\s\S]*?)\n---\n/;
const TRANSLATIONS = i18n.languages.filter((locale) => locale !== i18n.defaultLanguage);
const LOCALE_SUFFIX = new RegExp(`\\.(${TRANSLATIONS.join("|")})\\.mdx$`);

const WORD_CEILING: Record<PageType, number> = {
  overview: 600,
  tutorial: 900,
  "how-to": 1200,
  concept: 1800,
  reference: 3000,
};

function wordCeiling(file: string, type: PageType): number {
  return LOOKUP_REFERENCE_PAGES.has(file) ? LOOKUP_REFERENCE_CEILING : WORD_CEILING[type];
}

function readPage(file: string): string {
  return readFileSync(join(CONTENT_DIR, file), "utf8");
}

function pageType(source: string): string | undefined {
  const frontmatter = FRONTMATTER.exec(source)?.[1] ?? "";
  return /^type:\s*(\S+)\s*$/m.exec(frontmatter)?.[1];
}

function isPageType(value: string): value is PageType {
  return (PAGE_TYPES as readonly string[]).includes(value);
}

function englishPages(): string[] {
  return readdirSync(CONTENT_DIR, { recursive: true, encoding: "utf8" })
    .filter((file) => file.endsWith(".mdx") && !LOCALE_SUFFIX.test(file))
    .sort();
}

function typedPages(): Array<[string, PageType]> {
  return englishPages().flatMap((file) => {
    const type = pageType(readPage(file));
    return type !== undefined && isPageType(type) ? [[file, type] as [string, PageType]] : [];
  });
}

function everydayGuides(): string[] {
  const { pages } = JSON.parse(readFileSync(GUIDES_META, "utf8")) as { pages: string[] };
  const start = pages.indexOf("---Everyday---") + 1;
  const end = pages.findIndex((entry, index) => index >= start && entry.startsWith("---"));
  return pages.slice(start, end).map((entry) => join("(guides)", `${entry}.mdx`));
}

describe("page type frontmatter", () => {
  it("gives every page a type", () => {
    const untyped = englishPages().filter((file) => pageType(readPage(file)) === undefined);
    expect(untyped).toEqual([]);
  });

  it("makes the docs home the overview page", () => {
    expect(pageType(readPage("index.mdx"))).toBe("overview");
  });

  it("names only a known page type", () => {
    const unknown = englishPages().filter((file) => {
      const type = pageType(readPage(file));
      return type !== undefined && !isPageType(type);
    });
    expect(unknown).toEqual([]);
  });

  it.each(typedPages())("keeps %s under the word ceiling of a %s page", (file, type) => {
    expect(proseWords(readPage(file))).toBeLessThanOrEqual(wordCeiling(file, type));
  });

  it.each(typedPages())("gives every translation of %s the same type", (file, type) => {
    for (const locale of TRANSLATIONS) {
      const translated = readPage(file.replace(/\.mdx$/, `.${locale}.mdx`));
      expect(pageType(translated), locale).toBe(type);
    }
  });

  it("keeps the raised ceiling for reference lookup pages only", () => {
    expect(LOOKUP_REFERENCE_CEILING).toBeGreaterThan(WORD_CEILING.reference);
    for (const file of LOOKUP_REFERENCE_PAGES) {
      expect(pageType(readPage(file)), file).toBe("reference");
    }
  });

  it("marks every Everyday guide as a how-to", () => {
    const guides = everydayGuides();
    expect(guides.length).toBeGreaterThan(0);
    for (const file of guides) expect(pageType(readPage(file)), file).toBe("how-to");
  });

  it("fails a page that runs past its ceiling, so the check is not vacuous", () => {
    const padded = `---\ntype: how-to\n---\n${"word ".repeat(WORD_CEILING["how-to"] + 1)}`;
    expect(proseWords(padded)).toBeGreaterThan(WORD_CEILING["how-to"]);
  });
});
