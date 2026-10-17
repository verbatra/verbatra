import { describe, expect, it } from "vitest";
import { headingSlugs } from "@/lib/heading-slugs";
import { i18n } from "@/lib/i18n";
import {
  COMPARE_LAST_CHECKED,
  COMPARE_ROWS,
  COMPARE_SOURCE_COUNT,
  COMPARE_TOOLS,
  CONCESSION_FOOTNOTES,
  type CompareSourceLink,
  cellFootnote,
  compareSource,
  fullTableFootnotes,
  SHORT_COLUMNS,
  SHORT_ROWS,
  shortCellFootnotes,
  shortCellIsYes,
} from "@/lib/landing-compare";
import { docsPageSource } from "@/test-support/docs-page-source";

function expectResolvable(link: CompareSourceLink, label: string): void {
  if (typeof link === "string") {
    expect(new URL(link).protocol, `${label} ${link}`).toBe("https:");
    expect(link).not.toContain("verbatra.kreitz-webdev.de");
    return;
  }
  for (const locale of i18n.languages) {
    const anchor = link.anchors?.[locale];
    const source = docsPageSource(link.page, locale);
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
    expect(SHORT_COLUMNS).toEqual(["verbatra", "lingo", "hostedTms", "manual"]);
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
    expect(SHORT_ROWS.map((row) => shortCellFootnotes(row, "manual"))).toEqual(
      SHORT_ROWS.map(() => ["M"]),
    );
  });

  it("checks a short cell only where the full table's own text says yes", () => {
    const marks = SHORT_ROWS.map((row) =>
      SHORT_COLUMNS.map((column) => (shortCellIsYes(row, column) ? "yes" : "words")),
    );
    expect(marks).toEqual([
      ["yes", "words", "words", "words"],
      ["yes", "words", "words", "yes"],
      ["yes", "yes", "words", "words"],
      ["yes", "words", "yes", "words"],
      ["yes", "yes", "yes", "words"],
    ]);
  });

  it("footnotes each hosted TMS summary with exactly the three cells it sums up", () => {
    for (const row of SHORT_ROWS) {
      expect(shortCellFootnotes(row, "hostedTms"), row).toEqual(
        (["crowdin", "lokalise", "phrase"] as const).map((tool) => cellFootnote(row, tool)),
      );
    }
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

  it("backs the concession with every in-context source, Tolgee's included, and Verbatra's own", () => {
    expect(CONCESSION_FOOTNOTES).toEqual([10, 11, 34, 58, 70, 82]);
  });

  it("dates the check as a real ISO day", () => {
    expect(COMPARE_LAST_CHECKED).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(
      new Date(Date.parse(`${COMPARE_LAST_CHECKED}T00:00:00Z`)).toISOString().slice(0, 10),
    ).toBe(COMPARE_LAST_CHECKED);
  });

  it("refuses a source number outside the list", () => {
    expect(() => compareSource(0)).toThrow("no comparison source 0");
    expect(() => compareSource(COMPARE_SOURCE_COUNT + 1)).toThrow(
      `no comparison source ${COMPARE_SOURCE_COUNT + 1}`,
    );
  });
});
