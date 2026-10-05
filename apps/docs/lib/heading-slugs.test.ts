import { describe, expect, it } from "vitest";
import { headingSlugs } from "@/lib/heading-slugs";

describe("headingSlugs", () => {
  it("slugs level two to six headings and ignores the page title", () => {
    expect(headingSlugs("# Title\n\n## Getting started\n\n#### Use `--json` output!")).toEqual([
      "getting-started",
      "use---json-output",
    ]);
  });

  it("keeps letters outside ASCII", () => {
    expect(headingSlugs("## Locale-Unterstützung\n### Exiger des traductions relues")).toEqual([
      "locale-unterstützung",
      "exiger-des-traductions-relues",
    ]);
  });

  it("skips headings inside fenced code blocks", () => {
    const source = [
      "## Before",
      "```md",
      "## Not a heading",
      "```",
      "~~~",
      "### Also not one",
      "~~~",
      "## After",
    ].join("\n");

    expect(headingSlugs(source)).toEqual(["before", "after"]);
  });

  it("suffixes a repeated heading the way the rendered anchor does", () => {
    expect(headingSlugs("## Example\n## Example\n### Example")).toEqual([
      "example",
      "example-1",
      "example-2",
    ]);
  });

  it("skips a suffix an earlier heading already took", () => {
    expect(headingSlugs("## Example 1\n## Example\n## Example")).toEqual([
      "example-1",
      "example",
      "example-2",
    ]);
  });
});
