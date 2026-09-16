import { describe, expect, it } from "vitest";
import { renderTmxExportHuman, renderTmxImportHuman } from "./render.js";
import { makeExportTmxResult, makeImportTmxResult } from "./test-support.js";

const ESCAPE = String.fromCharCode(27);

describe("render: tmx import summary", () => {
  it("names each note only when it has something to report", () => {
    const text = renderTmxImportHuman(makeImportTmxResult({ units: 1 }));

    expect(text).toContain("1 units read (source language en)");
    expect(text).not.toContain("could not be read");
    expect(text).not.toContain("inline markup");
    expect(text).not.toContain("dry run");
    expect(text).not.toContain("newer verbatra");
  });

  it("reports a file that declared no source language", () => {
    const text = renderTmxImportHuman(makeImportTmxResult({ sourceLanguage: undefined }));

    expect(text).toContain("no source language declared");
  });

  it("reports skipped, sourceless, markup-stripped, dry-run and unwritable memory", () => {
    const text = renderTmxImportHuman(
      makeImportTmxResult({
        dryRun: true,
        skippedUnits: 2,
        unmatchedSourceUnits: 3,
        markupStrippedUnits: 4,
        memoryWritable: false,
        ambiguousLanguages: [{ language: "pt-PT", units: 1 }],
      }),
    );

    expect(text).toContain("2 units could not be read and were skipped");
    expect(text).toContain("3 units carried no segment in the source locale");
    expect(text).toContain("4 units carried inline markup, which was dropped");
    expect(text).toContain("languages two configured locales could claim: pt-PT (1)");
    expect(text).toContain("newer verbatra");
    expect(text).toContain("dry run: nothing written");
  });

  it("neutralizes control characters in a language tag it echoes back", () => {
    const text = renderTmxImportHuman(
      makeImportTmxResult({ unmatchedLanguages: [{ language: `${ESCAPE}[31mde\nx`, units: 1 }] }),
    );

    expect(text).not.toContain(ESCAPE);
    expect(text).toContain(" [31mde x (1)");
  });

  it("neutralizes control characters in the header source language too", () => {
    const text = renderTmxImportHuman(makeImportTmxResult({ sourceLanguage: `en${ESCAPE}[31m` }));

    expect(text).not.toContain(ESCAPE);
  });

  it("caps a language tag long enough to flood a terminal line", () => {
    const text = renderTmxImportHuman(
      makeImportTmxResult({ unmatchedLanguages: [{ language: "x".repeat(200), units: 1 }] }),
    );

    expect(text).toContain("...");
    expect(text).not.toContain("x".repeat(30));
  });

  it("names the configured locales a narrowed run left out", () => {
    const text = renderTmxImportHuman(
      makeImportTmxResult({ notImported: [{ language: "fr", units: 4 }] }),
    );

    expect(text).toContain("configured locales this run left out: fr (4)");
  });

  it("names every rejection reason it is given", () => {
    const text = renderTmxImportHuman(
      makeImportTmxResult({
        locales: [
          {
            locale: "de",
            added: 0,
            unchanged: 0,
            overwritten: 0,
            kept: 0,
            duplicates: 0,
            rejected: { placeholder: 1, icu: 2, degenerate: 3, empty: 4, sourceBlank: 5 },
          },
        ],
      }),
    );

    expect(text).toContain("1 placeholders do not match the source");
    expect(text).toContain("2 not a valid ICU message");
    expect(text).toContain("3 runaway output rather than a translation");
    expect(text).toContain("4 blank translation of a source that has text");
    expect(text).toContain("5 blank source segment");
  });

  it("prints no rejection line for a locale that refused nothing", () => {
    const text = renderTmxImportHuman(
      makeImportTmxResult({
        locales: [
          {
            locale: "de",
            added: 1,
            unchanged: 0,
            overwritten: 0,
            kept: 0,
            duplicates: 0,
            rejected: { placeholder: 0, icu: 0, degenerate: 0, empty: 0, sourceBlank: 0 },
          },
        ],
      }),
    );

    expect(text).toContain("de: 1 added");
    expect(text).not.toContain("do not match");
  });
});

describe("render: tmx export summary", () => {
  it("omits the left-out line when every entry had its source", () => {
    const text = renderTmxExportHuman(makeExportTmxResult({ units: 2 }));

    expect(text).toContain("2 units across 0 locales");
    expect(text).not.toContain("left out");
  });

  it("reports the entries it had to leave out", () => {
    const text = renderTmxExportHuman(makeExportTmxResult({ withoutSource: 3 }));

    expect(text).toContain("3 entries left out: the memory holds no source text for them");
  });
});
