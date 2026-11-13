import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import { type CellTranslator, type CompareCellView, compareCellView } from "@/lib/compare-cells";
import { COMPARE_ROWS, COMPARE_TOOLS } from "@/lib/landing-compare";
import { MACHINE_PROVIDER_IDS, SUPPORTED_FORMAT_IDS } from "@/lib/landing-facts";

function translator(): CellTranslator {
  const path = fileURLToPath(new URL("../messages/en.json", import.meta.url));
  return createTranslator({
    locale: "en",
    messages: JSON.parse(readFileSync(path, "utf8")),
    namespace: "landing.compare",
  });
}

describe("compareCellView", () => {
  const t = translator();

  it("shows a verdict as its mark and its vocabulary word with the qualifier", () => {
    expect(compareCellView(t, "ownKeys", "verbatra")).toMatchObject({
      kind: "verdict",
      mark: "yes",
      word: "Yes",
      note: "environment variables only",
    });
  });

  it("gives a search that found nothing the question mark and the words none found", () => {
    expect(compareCellView(t, "ci", "tolgee")).toMatchObject({
      mark: "unknown",
      word: "None found",
    });
  });

  it("shows a value with no mark", () => {
    expect(compareCellView(t, "license", "weblate")).not.toHaveProperty("mark");
    expect(compareCellView(t, "license", "weblate")).toMatchObject({
      kind: "value",
      word: "GPL-3.0-or-later",
      note: "`wlc` CLI too",
    });
  });

  it("counts Verbatra's providers and formats from the registries, with no names", () => {
    expect(compareCellView(t, "providers", "verbatra")).toMatchObject({
      word: `${MACHINE_PROVIDER_IDS.length} built in`,
      note: null,
    });
    expect(compareCellView(t, "formats", "verbatra").word).toBe(
      `${SUPPORTED_FORMAT_IDS.length} formats`,
    );
  });

  it("shows a manual cell with no product as not applicable and no mark", () => {
    expect(compareCellView(t, "cli", "manual")).toMatchObject({
      kind: "notApplicable",
      word: "n/a",
      note: null,
    });
  });

  it("answers every cell of the table with a word", () => {
    for (const row of COMPARE_ROWS)
      for (const tool of COMPARE_TOOLS)
        expect(compareCellView(t, row, tool).word, `${row}.${tool}`).not.toBe("");
  });
});

describe("CompareCellView", () => {
  it("carries a mark on a verdict only", () => {
    const text = { word: "Yes", note: null, urls: [] };
    const verdict: CompareCellView = { ...text, kind: "verdict", mark: "yes" };
    // @ts-expect-error a value cell has no mark
    const value: CompareCellView = { ...text, kind: "value", mark: "yes" };
    // @ts-expect-error a verdict cell needs its mark
    const bare: CompareCellView = { ...text, kind: "verdict" };
    expect([verdict.kind, value.kind, bare.kind]).toEqual(["verdict", "value", "verdict"]);
  });
});
