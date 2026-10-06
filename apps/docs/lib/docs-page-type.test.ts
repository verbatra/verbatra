import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { englishDocsPages, readIncludedSource } from "./docs-pages";
import { i18n } from "./i18n";
import {
  COMMAND_PAGE_CEILING,
  formatBudgetReport,
  isPageType,
  LOOKUP_REFERENCE_CEILING,
  LOOKUP_REFERENCE_PAGES,
  type PageBudget,
  type PageType,
  POST_RELEASE_WORD_CEILING,
  pageBudget,
  pagesNearCeiling,
  pageType,
  proseWords,
  WORD_CEILING,
  wordCeiling,
} from "./page-type";

const CONTENT_DIR = join(import.meta.dirname, "../content/docs");
const GUIDES_META = join(CONTENT_DIR, "(guides)/meta.json");
const TRANSLATIONS = i18n.languages.filter((locale) => locale !== i18n.defaultLanguage);
const LOCALE_SUFFIX = new RegExp(`\\.(${TRANSLATIONS.join("|")})\\.mdx$`);

function readPage(file: string): string {
  return readIncludedSource(join(CONTENT_DIR, file));
}

function englishPages(): string[] {
  return englishDocsPages(CONTENT_DIR).map(({ file }) => file);
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
  it("lists exactly the pages without a locale suffix as English pages", () => {
    const bySuffix = readdirSync(CONTENT_DIR, { recursive: true, encoding: "utf8" })
      .filter((file) => file.endsWith(".mdx") && !LOCALE_SUFFIX.test(file))
      .sort();
    expect(englishPages()).toEqual(bySuffix);
  });

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

  it.each(typedPages())(
    "already keeps %s under the post-0.12.0 ceiling of a %s page",
    (file, type) => {
      expect(proseWords(readPage(file))).toBeLessThanOrEqual(
        wordCeiling(file, type, POST_RELEASE_WORD_CEILING),
      );
    },
  );

  it("lowers only the concept and reference ceilings after 0.12.0, never raises one", () => {
    for (const type of Object.keys(WORD_CEILING) as PageType[]) {
      expect(POST_RELEASE_WORD_CEILING[type], type).toBeLessThanOrEqual(WORD_CEILING[type]);
    }
    expect(POST_RELEASE_WORD_CEILING.concept).toBe(1600);
    expect(POST_RELEASE_WORD_CEILING.reference).toBe(2500);
    expect(wordCeiling("(reference)/error-codes.mdx", "reference", POST_RELEASE_WORD_CEILING)).toBe(
      LOOKUP_REFERENCE_CEILING,
    );
    expect(wordCeiling("cli/translate.mdx", "reference", POST_RELEASE_WORD_CEILING)).toBe(
      COMMAND_PAGE_CEILING,
    );
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

  it("caps a CLI command page below the reference ceiling, and only a command page", () => {
    expect(COMMAND_PAGE_CEILING).toBeLessThan(WORD_CEILING.reference);
    expect(wordCeiling("cli/translate.mdx", "reference")).toBe(COMMAND_PAGE_CEILING);
    expect(wordCeiling("cli/index.mdx", "reference")).toBe(WORD_CEILING.reference);
    expect(wordCeiling("cli/output.mdx", "reference")).toBe(WORD_CEILING.reference);
    expect(wordCeiling("sdk/run.mdx", "reference")).toBe(WORD_CEILING.reference);
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

describe("the headroom report", () => {
  const budget = (file: string, words: number): PageBudget => ({
    file,
    type: "how-to",
    words,
    ceiling: WORD_CEILING["how-to"],
  });

  it("lists a page from 90 percent of its ceiling, fullest first, and nothing below", () => {
    const near = pagesNearCeiling([
      budget("a.mdx", 1079),
      budget("b.mdx", 1080),
      budget("c.mdx", 1199),
    ]);
    expect(near.map(({ file }) => file)).toEqual(["c.mdx", "b.mdx"]);
  });

  it("prints each listed page with its words, ceiling, share and room left", () => {
    const report = formatBudgetReport([budget("(guides)/x.mdx", 1150)]);
    expect(report).toMatch(
      /^Pages at or above 90% of their ceiling: 1\n\(guides\)\/x\.mdx +how-to +1150\/1200 +96% +50 left$/,
    );
    expect(formatBudgetReport([budget("y.mdx", 10)])).toBe(
      "No page is at or above 90% of its ceiling.",
    );
  });

  it("measures every typed page with the same counter and ceiling as the ceiling test", () => {
    for (const [file, type] of typedPages()) {
      expect(pageBudget(file, readPage(file))).toEqual({
        file,
        type,
        words: proseWords(readPage(file)),
        ceiling: wordCeiling(file, type),
      });
    }
  });
});
