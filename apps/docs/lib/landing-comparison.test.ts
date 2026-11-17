import { describe, expect, it } from "vitest";
import { i18n } from "@/lib/i18n";
import {
  COMPARISON_ANCHOR,
  COMPARISON_ROWS,
  COMPARISON_TOOLS,
  COMPARISON_VERDICTS,
  type ComparisonRow,
  type ComparisonTool,
  comparisonCell,
  comparisonHref,
} from "@/lib/landing-comparison";

const EXPECTED_GRID: Readonly<Record<ComparisonRow, Readonly<Record<ComparisonTool, string>>>> = {
  vendorAccount: { verbatra: "yes", crowdin: "no", tolgee: "partial", lingo: "no", manual: "yes" },
  ownKeys: { verbatra: "yes", crowdin: "yes", tolgee: "partial", lingo: "partial", manual: "yes" },
  changedKeys: {
    verbatra: "yes",
    crowdin: "partial",
    tolgee: "partial",
    lingo: "yes",
    manual: "no",
  },
  ciGate: { verbatra: "yes", crowdin: "yes", tolgee: "no", lingo: "yes", manual: "no" },
  placeholderCheck: {
    verbatra: "yes",
    crowdin: "yes",
    tolgee: "yes",
    lingo: "partial",
    manual: "no",
  },
  webEditor: { verbatra: "partial", crowdin: "yes", tolgee: "yes", lingo: "partial", manual: "no" },
};

describe("the landing comparison data", () => {
  it("puts verbatra first and the manual workflow last", () => {
    expect(COMPARISON_TOOLS).toEqual(["verbatra", "crowdin", "tolgee", "lingo", "manual"]);
  });

  it("keeps six rows in the grid order", () => {
    expect(COMPARISON_ROWS).toEqual([
      "vendorAccount",
      "ownKeys",
      "changedKeys",
      "ciGate",
      "placeholderCheck",
      "webEditor",
    ]);
  });

  it("holds exactly the pinned verdicts, every one yes, partial or no", () => {
    for (const row of COMPARISON_ROWS)
      for (const tool of COMPARISON_TOOLS) {
        const { verdict } = comparisonCell(row, tool);
        expect(COMPARISON_VERDICTS).toContain(verdict);
        expect(verdict, `${row}.${tool}`).toBe(EXPECTED_GRID[row][tool]);
      }
  });

  it("gives every cell of a tool at least one https source and the manual column none", () => {
    for (const row of COMPARISON_ROWS)
      for (const tool of COMPARISON_TOOLS) {
        const { sources } = comparisonCell(row, tool);
        if (tool === "manual") {
          expect(sources, `${row}.${tool}`).toEqual([]);
          continue;
        }
        expect(sources.length, `${row}.${tool}`).toBeGreaterThanOrEqual(1);
        for (const url of sources) expect(new URL(url).protocol, url).toBe("https:");
      }
  });

  it("links to the landing anchor of the same locale's home", () => {
    expect(COMPARISON_ANCHOR).toBe("compare");
    expect(comparisonHref("en")).toBe("/#compare");
    for (const locale of i18n.languages.filter((lang) => lang !== i18n.defaultLanguage))
      expect(comparisonHref(locale)).toBe(`/${locale}#compare`);
  });
});
