import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { headingSlugs } from "@/lib/heading-slugs";
import { i18n, type Locale } from "@/lib/i18n";
import {
  COMPARE_LAST_CHECKED,
  COMPARE_ROWS,
  COMPARE_SOURCE_COUNT,
  COMPARE_TOOLS,
  type CompareSourceLink,
  cellFootnote,
  compareSource,
  FULL_CONCESSION_FOOTNOTES,
  fullTableFootnotes,
  SHORT_COLUMNS,
  SHORT_CONCESSION_FOOTNOTES,
  SHORT_ROWS,
  shortCellFootnotes,
  shortTableFootnotes,
} from "@/lib/landing-compare";

const CONTENT = fileURLToPath(new URL("../content/docs", import.meta.url));

function pageSource(page: string, locale: Locale): string {
  const suffix = locale === i18n.defaultLanguage ? "" : `.${locale}`;
  const slug = page.replace(/^\/docs\/?/, "");
  const wanted =
    slug === "" ? [`index${suffix}.mdx`] : [`${slug}${suffix}.mdx`, `${slug}/index${suffix}.mdx`];
  const file = readdirSync(CONTENT, { recursive: true, encoding: "utf8" }).find((entry) =>
    wanted.includes(entry.replace(/\([^)]+\)\//g, "")),
  );
  if (!file) throw new Error(`no ${wanted.join(" or ")} under ${CONTENT}`);
  return readFileSync(join(CONTENT, file), "utf8");
}

function expectResolvable(link: CompareSourceLink, label: string): void {
  if (typeof link === "string") {
    expect(new URL(link).protocol, `${label} ${link}`).toBe("https:");
    expect(link).not.toContain("verbatra.kreitz-webdev.de");
    return;
  }
  for (const locale of i18n.languages) {
    const anchor = link.anchors?.[locale];
    const source = pageSource(link.page, locale);
    if (anchor !== undefined) expect(headingSlugs(source), `${label} ${locale}`).toContain(anchor);
  }
}

describe("the comparison data", () => {
  it("keeps one numbered source per sourced cell of the full table, in column then row order", () => {
    const sourced = COMPARE_TOOLS.filter((tool) => tool !== "manual");
    expect(COMPARE_SOURCE_COUNT).toBe(sourced.length * COMPARE_ROWS.length);
    sourced.forEach((tool, block) => {
      COMPARE_ROWS.forEach((row, index) => {
        const footnote = block * COMPARE_ROWS.length + index + 1;
        expect(cellFootnote(row, tool)).toBe(footnote);
        expect(compareSource(footnote).tool).toBe(tool);
      });
    });
    expect(cellFootnote("license", "manual")).toBe("M");
  });

  it("cites the same numbers in the short table as the full table for the same cell", () => {
    expect(SHORT_ROWS).toEqual(["license", "ownKeys", "incremental", "ci", "mcp"]);
    expect(
      COMPARE_ROWS.filter((row) => (SHORT_ROWS as ReadonlyArray<string>).includes(row)),
    ).toEqual([...SHORT_ROWS]);
    expect(SHORT_COLUMNS).toEqual(["verbatra", "lingo", "tolgee", "hostedTms", "manual"]);
    expect(SHORT_ROWS.map((row) => shortCellFootnotes(row, "hostedTms"))).toEqual([
      [49, 61, 73],
      [53, 65, 77],
      [54, 66, 78],
      [56, 68, 80],
      [57, 69, 81],
    ]);
    expect(SHORT_ROWS.map((row) => shortCellFootnotes(row, "lingo"))).toEqual([
      [13],
      [17],
      [18],
      [20],
      [21],
    ]);
    expect(SHORT_ROWS.map((row) => shortCellFootnotes(row, "verbatra"))).toEqual([
      [1],
      [5],
      [6],
      [8],
      [9],
    ]);
  });

  it("backs the concession with the hosted in-context sources and Verbatra's own", () => {
    expect(SHORT_CONCESSION_FOOTNOTES).toEqual([58, 70, 82, 10, 11]);
    for (const footnote of SHORT_CONCESSION_FOOTNOTES)
      expect(shortTableFootnotes()).toContain(footnote);
  });

  it("links every source over https or to a page of this site that exists in every locale", () => {
    for (let footnote = 1; footnote <= COMPARE_SOURCE_COUNT; footnote += 1) {
      const { urls } = compareSource(footnote);
      expect(urls.length, `${footnote}`).toBeGreaterThan(0);
      for (const link of urls) expectResolvable(link, `${footnote}`);
    }
  });

  it("lists every source on the full table, in order", () => {
    expect(fullTableFootnotes()).toEqual(
      Array.from({ length: COMPARE_SOURCE_COUNT }, (_, index) => index + 1),
    );
  });

  it("backs the full table's concession with every in-context source and Verbatra's own", () => {
    expect(FULL_CONCESSION_FOOTNOTES).toEqual([34, 58, 70, 82, 10, 11]);
  });

  it("dates the check as an ISO day", () => {
    expect(COMPARE_LAST_CHECKED).toBe("2026-10-15");
  });
});
