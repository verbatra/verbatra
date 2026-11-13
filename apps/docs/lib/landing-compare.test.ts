import { describe, expect, it } from "vitest";
import { headingSlugs } from "@/lib/heading-slugs";
import { i18n } from "@/lib/i18n";
import {
  COMPARE_LAST_CHECKED,
  COMPARE_ROWS,
  COMPARE_SOURCE_COUNT,
  COMPARE_TOOLS,
  CONCESSION_FOOTNOTES,
  type CompareRowId,
  type CompareSourceLink,
  type CompareTool,
  cellFootnote,
  compareCell,
  compareSource,
  fullTableFootnotes,
  verdictMark,
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

function hrefs(row: CompareRowId, tool: CompareTool): ReadonlyArray<string> {
  return compareCell(row, tool).urls.map((link) => (typeof link === "string" ? link : link.page));
}

const SOURCED = COMPARE_TOOLS.filter((tool) => tool !== "manual");
const PLATFORMS: ReadonlyArray<CompareTool> = [
  "tolgee",
  "weblate",
  "crowdin",
  "lokalise",
  "phrase",
];
const VALUE_ROWS: ReadonlyArray<CompareRowId> = ["license", "pricing", "providers", "formats"];

describe("the comparison data", () => {
  it("keeps one numbered source per sourced cell of the full table, in column then row order", () => {
    expect(COMPARE_SOURCE_COUNT).toBe(SOURCED.length * COMPARE_ROWS.length);
    SOURCED.forEach((tool, block) => {
      COMPARE_ROWS.forEach((row, index) => {
        const footnote = block * COMPARE_ROWS.length + index + 1;
        expect(cellFootnote(row, tool)).toBe(footnote);
        expect(compareSource(footnote).tool).toBe(tool);
        expect(compareSource(footnote).urls).toEqual(compareCell(row, tool).urls);
      });
    });
    expect(cellFootnote("license", "manual")).toBe("M");
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

  it("dates the check as a real ISO day, the day of the re-check", () => {
    expect(COMPARE_LAST_CHECKED).toBe("2026-11-13");
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

describe("the comparison cells", () => {
  it("types every cell as a verdict, a value or not applicable", () => {
    for (const row of COMPARE_ROWS)
      for (const tool of COMPARE_TOOLS)
        expect(["verdict", "value", "notApplicable"], `${row}.${tool}`).toContain(
          compareCell(row, tool).kind,
        );
  });

  it("gives every sourced cell at least one source and the manual column none", () => {
    for (const row of COMPARE_ROWS) {
      for (const tool of SOURCED)
        expect(compareCell(row, tool).urls.length, `${row}.${tool}`).toBeGreaterThan(0);
      expect(compareCell(row, "manual").urls, row).toEqual([]);
    }
  });

  it("shows license, pricing, providers and formats as values with no mark", () => {
    for (const row of VALUE_ROWS)
      for (const tool of SOURCED)
        expect(compareCell(row, tool).kind, `${row}.${tool}`).toBe("value");
  });

  it("derives the mark from the verdict and gives none-found the question mark, never a cross", () => {
    expect(verdictMark("yes")).toBe("yes");
    expect(verdictMark("no")).toBe("no");
    expect(verdictMark("partial")).toBe("partial");
    expect(verdictMark("unknown")).toBe("unknown");
    expect(verdictMark("noneFound")).toBe("unknown");
  });

  it("marks a search that found nothing as none found", () => {
    for (const [row, tool] of [
      ["selfHosting", "lingo"],
      ["ci", "tolgee"],
      ["mcp", "weblate"],
      ["inContext", "weblate"],
    ] as const)
      expect(compareCell(row, tool), `${row}.${tool}`).toMatchObject({
        kind: "verdict",
        verdict: "noneFound",
      });
  });

  it("keeps what no source settles unknown", () => {
    for (const [row, tool] of [
      ["selfHosting", "crowdin"],
      ["selfHosting", "phrase"],
      ["ownKeys", "lokalise"],
      ["inContext", "lingo"],
    ] as const)
      expect(compareCell(row, tool), `${row}.${tool}`).toMatchObject({ verdict: "unknown" });
  });

  it("marks the five platforms partial for incremental translation and Verbatra yes", () => {
    for (const tool of PLATFORMS)
      expect(compareCell("incremental", tool), tool).toMatchObject({ verdict: "partial" });
    expect(compareCell("incremental", "verbatra")).toMatchObject({ verdict: "yes" });
  });

  it("applies the re-check: Lingo.dev review queue, Verbatra Studio, Weblate and Phrase CI", () => {
    expect(compareCell("translatorUi", "lingo")).toMatchObject({ verdict: "partial" });
    expect(compareCell("translatorUi", "verbatra")).toMatchObject({ verdict: "partial" });
    expect(compareCell("ci", "weblate")).toMatchObject({ verdict: "partial" });
    expect(compareCell("ci", "phrase")).toMatchObject({ verdict: "yes" });
  });

  it("says Verbatra has no in-context editor and shows its own hosting as a value", () => {
    expect(compareCell("inContext", "verbatra")).toMatchObject({ verdict: "no" });
    expect(compareCell("selfHosting", "verbatra").kind).toBe("value");
  });

  it("marks the manual column as values or not applicable, never a verdict", () => {
    for (const row of COMPARE_ROWS)
      expect(["value", "notApplicable"], row).toContain(compareCell(row, "manual").kind);
  });

  it("swaps the three stale source URLs and adds the re-check sources", () => {
    expect(hrefs("incremental", "tolgee")).toEqual([
      "https://docs.tolgee.io/platform/projects_and_organizations/machine-translation-settings",
    ]);
    expect(hrefs("cli", "tolgee")).toEqual([
      "https://raw.githubusercontent.com/tolgee/tolgee-cli/main/package.json",
    ]);
    expect(hrefs("ci", "phrase")).toEqual([
      "https://github.com/phrase/setup-cli",
      "https://support.phrase.com/hc/en-us/articles/5822060164508-Continuous-Integration-Strings",
    ]);
    expect(hrefs("translatorUi", "lingo")).toContain(
      "https://lingo.dev/en/docs/api/pipeline/human-review",
    );
    expect(hrefs("ci", "weblate")).toContain(
      "https://github.com/marketplace/actions/weblate-locale-linter",
    );
  });
});
