import type { ImportTmxResult, UnusedKeysScan } from "@verbatra/sdk";
import { describe, expect, it } from "vitest";
import {
  renderDiffHuman,
  renderExportHuman,
  renderExtractHuman,
  renderHuman,
  renderPseudoHuman,
  renderTmxExportHuman,
  renderTmxImportHuman,
  renderTypesHuman,
} from "./render.js";
import {
  makeDiffSummary,
  makeExportTmxResult,
  makeExtractResult,
  makeImportTmxResult,
  makeLocale,
  makePseudoResult,
  makeSummary,
  makeTypesResult,
} from "./test-support.js";

type TmxLocale = ImportTmxResult["locales"][number];

function tmxLocale(overrides: Partial<TmxLocale> = {}): TmxLocale {
  return {
    locale: "de",
    added: 0,
    unchanged: 0,
    overwritten: 0,
    kept: 0,
    duplicates: 0,
    conflicting: 0,
    rejected: { placeholder: 0, markup: 0, icu: 0, degenerate: 0, empty: 0, sourceBlank: 0 },
    refusals: [],
    ...overrides,
  };
}

function unusedScan(scannedFiles: number): UnusedKeysScan {
  return {
    status: "complete",
    unreliableBecause: [],
    scannedFiles,
    unused: [],
    possiblyDynamic: [],
    ignored: [],
    dynamicPrefixes: [],
  };
}

function exportRows(rows: number): string {
  return renderExportHuman({ path: "/p/wb.xlsx", locales: [{ locale: "de", rows }] });
}

describe("render: count wording agrees with the count", () => {
  it.each([
    ["export locale rows", (n: number) => exportRows(n), "de: 1 row", "de: 2 rows"],
    [
      "export total",
      (n: number) =>
        renderExportHuman({
          path: "/p/wb.xlsx",
          locales: Array.from({ length: n }, (_, i) => ({ locale: `l${i}`, rows: 1 })),
        }),
      "1 row across 1 locale",
      "2 rows across 2 locales",
    ],
    [
      "pseudo entries",
      (n: number) => renderPseudoHuman(makePseudoResult({ entries: n, transformed: n })),
      "en-XA: 1 of 1 entry pseudolocalized",
      "en-XA: 2 of 2 entries pseudolocalized",
    ],
    [
      "extract scanned files and present keys",
      (n: number) => renderExtractHuman(makeExtractResult({ scannedFiles: n, existingKeys: n })),
      "1 file scanned, 1 key already present",
      "2 files scanned, 2 keys already present",
    ],
    [
      "types declared keys",
      (n: number) => renderTypesHuman(makeTypesResult({ keys: n })),
      "  1 key declared,",
      "  2 keys declared,",
    ],
    [
      "diff --unused scanned files",
      (n: number) =>
        renderDiffHuman(makeDiffSummary({ hasPendingChanges: false, unused: unusedScan(n) })),
      ", 1 file scanned",
      ", 2 files scanned",
    ],
    [
      "translate token total",
      (n: number) =>
        renderHuman(
          makeSummary({
            locales: [makeLocale({ usage: { inputTokens: n, outputTokens: 0 } })],
            usage: { inputTokens: n, outputTokens: 0 },
          }),
        ),
      "total: 1 token (1 in, 0 out)",
      "total: 2 tokens (2 in, 0 out)",
    ],
    [
      "import malformed rows",
      (n: number) =>
        renderHuman(
          makeSummary({
            locales: [
              makeLocale({
                malformedRows: Array.from({ length: n }, (_, row) => ({ row, column: "Status" })),
              }),
            ],
          }),
          "import",
        ),
      "1 malformed-row",
      "2 malformed-rows",
    ],
    [
      "import duplicate keys",
      (n: number) =>
        renderHuman(
          makeSummary({
            locales: [
              makeLocale({
                duplicateKeys: Array.from({ length: n }, (_, row) => ({ key: `k${row}`, row })),
              }),
            ],
          }),
          "import",
        ),
      "1 duplicate-key",
      "2 duplicate-keys",
    ],
    [
      "translate notices",
      (n: number) =>
        renderHuman(
          makeSummary({
            locales: [
              makeLocale({
                notices: Array.from({ length: n }, () => ({
                  code: "SUB_BATCH_FAILED" as const,
                  message: "note",
                })),
              }),
            ],
          }),
        ),
      "1 notice",
      "2 notices",
    ],
    [
      "tmx import units read",
      (n: number) => renderTmxImportHuman(makeImportTmxResult({ units: n })),
      "  1 unit read (",
      "  2 units read (",
    ],
    [
      "tmx import skipped units",
      (n: number) => renderTmxImportHuman(makeImportTmxResult({ skippedUnits: n })),
      "1 unit could not be read and was skipped",
      "2 units could not be read and were skipped",
    ],
    [
      "tmx import sourceless units",
      (n: number) => renderTmxImportHuman(makeImportTmxResult({ unmatchedSourceUnits: n })),
      "  1 unit carried no segment in the source locale",
      "  2 units carried no segment in the source locale",
    ],
    [
      "tmx import conflicting source units",
      (n: number) => renderTmxImportHuman(makeImportTmxResult({ conflictingSourceUnits: n })),
      "1 unit carried source-locale segments of equal standing with different values, and was refused",
      "2 units carried source-locale segments of equal standing with different values, and were refused",
    ],
    [
      "tmx import unreachable units",
      (n: number) => renderTmxImportHuman(makeImportTmxResult({ unreachableUnits: n })),
      "1 unit sits outside the file's first body and was not read",
      "2 units sit outside the file's first body and were not read",
    ],
    [
      "tmx import markup-stripped units",
      (n: number) => renderTmxImportHuman(makeImportTmxResult({ markupStrippedUnits: n })),
      "  1 unit carried inline markup",
      "  2 units carried inline markup",
    ],
    [
      "tmx import sub-flow units",
      (n: number) => renderTmxImportHuman(makeImportTmxResult({ subflowDroppedUnits: n })),
      "  1 unit carried sub-flow text",
      "  2 units carried sub-flow text",
    ],
    [
      "tmx import conflicting locale units",
      (n: number) =>
        renderTmxImportHuman(makeImportTmxResult({ locales: [tmxLocale({ conflicting: n })] })),
      "1 unit carried differing segments for this locale, so it was not stored",
      "2 units carried differing segments for this locale, so none of them was stored",
    ],
    [
      "tmx export locale units",
      (n: number) =>
        renderTmxExportHuman(makeExportTmxResult({ locales: [{ locale: "de", units: n }] })),
      "de: 1 unit",
      "de: 2 units",
    ],
    [
      "tmx export total",
      (n: number) =>
        renderTmxExportHuman(
          makeExportTmxResult({
            units: n,
            locales: Array.from({ length: n }, (_, i) => ({ locale: `l${i}`, units: 1 })),
          }),
        ),
      "1 unit across 1 locale",
      "2 units across 2 locales",
    ],
    [
      "tmx export entries without source",
      (n: number) => renderTmxExportHuman(makeExportTmxResult({ withoutSource: n })),
      "1 entry left out: the memory holds no source text for it",
      "2 entries left out: the memory holds no source text for them",
    ],
    [
      "tmx export removed characters",
      (n: number) => renderTmxExportHuman(makeExportTmxResult({ illegalCharactersRemoved: n })),
      "1 character XML 1.0 does not allow was removed from segment text",
      "2 characters XML 1.0 does not allow were removed from segment text",
    ],
  ])("%s", (_label, render, one, two) => {
    const single = render(1);
    const several = render(2);

    expect(single).toContain(one);
    expect(several).toContain(two);
    expect(single).not.toContain(two);
  });
});
