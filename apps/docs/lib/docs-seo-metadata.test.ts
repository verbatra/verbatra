import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { displayWidth, SPACELESS_SNIPPET_WIDTH } from "./display-width";
import { DEFAULT_LOCALE, LOCALES, type Locale } from "./locales";
import { TITLE_SUFFIX } from "./social-metadata";

const CONTENT_DIR = join(import.meta.dirname, "../content/docs");
interface SnippetLimits {
  readonly title: { readonly min: number; readonly max: number };
  readonly descriptionMax: number;
  readonly measure?: (text: string) => number;
}

const SEARCH_LIMITS: SnippetLimits = { title: { min: 50, max: 60 }, descriptionMax: 160 };
const CJK_LIMITS: SnippetLimits = {
  title: { min: 20, max: SPACELESS_SNIPPET_WIDTH.titleMax },
  descriptionMax: SPACELESS_SNIPPET_WIDTH.descriptionMax,
  measure: displayWidth,
};

const SNIPPET_LIMITS: Readonly<Record<Locale, SnippetLimits>> = {
  en: SEARCH_LIMITS,
  de: SEARCH_LIMITS,
  es: SEARCH_LIMITS,
  fr: SEARCH_LIMITS,
  "zh-CN": CJK_LIMITS,
  "pt-BR": SEARCH_LIMITS,
};

function measured(limits: SnippetLimits, text: string): number {
  return limits.measure === undefined ? text.length : limits.measure(text);
}

function localeOfFile(file: string): Locale {
  return LOCALES.find((locale) => file.endsWith(`.${locale}.mdx`)) ?? DEFAULT_LOCALE;
}

function frontmatterField(source: string, field: string): string | undefined {
  const frontmatter = /^---\n([\s\S]*?)\n---/.exec(source)?.[1] ?? "";
  const raw = new RegExp(`^${field}: (.+)$`, "m").exec(frontmatter)?.[1]?.trim();
  if (raw === undefined) return undefined;
  return raw.startsWith('"') ? (JSON.parse(raw) as string) : raw;
}

const pages = readdirSync(CONTENT_DIR, { recursive: true, encoding: "utf8" })
  .filter((file) => file.endsWith(".mdx"))
  .sort()
  .map((file) => {
    const source = readFileSync(join(CONTENT_DIR, file), "utf8");
    const title = frontmatterField(source, "title") ?? "";
    return {
      file,
      limits: SNIPPET_LIMITS[localeOfFile(file)],
      documentTitle: `${frontmatterField(source, "seoTitle") ?? title}${TITLE_SUFFIX}`,
      description: frontmatterField(source, "description") ?? "",
    };
  });

describe("docs search snippets", () => {
  it.each(pages)(
    "$file has a document title inside its locale's length window, so a search result shows it whole",
    ({ documentTitle, limits }) => {
      expect(measured(limits, documentTitle)).toBeGreaterThanOrEqual(limits.title.min);
      expect(measured(limits, documentTitle)).toBeLessThanOrEqual(limits.title.max);
    },
  );

  it.each(pages)(
    "$file has a description inside its locale's length limit",
    ({ description, limits }) => {
      expect(description.length).toBeGreaterThan(0);
      expect(measured(limits, description)).toBeLessThanOrEqual(limits.descriptionMax);
    },
  );

  it("reads the locale of a page from its file name, and finds pages in every locale", () => {
    expect(new Set(pages.map(({ limits }) => limits))).toEqual(
      new Set([SEARCH_LIMITS, CJK_LIMITS]),
    );
    expect(pages.filter(({ limits }) => limits === CJK_LIMITS).length).toBeGreaterThan(40);
  });
});
