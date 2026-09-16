import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { readTmx } from "./read-tmx.js";

function fixture(name: string): string {
  return readFileSync(fileURLToPath(new URL(`./tmx-fixtures/${name}`, import.meta.url)), "utf8");
}

describe("a TMX file carrying an external doctype, props and notes", () => {
  const document = readTmx(fixture("doctype-and-props.tmx"));

  it("reads the header source language as the exporter spelled it", () => {
    expect(document.sourceLanguage).toBe("en-US");
  });

  it("reads every unit and skips none", () => {
    expect(document.units).toHaveLength(3);
    expect(document.skipped).toEqual([]);
  });

  it("ignores the unit-level prop and note rather than reading them as segments", () => {
    expect(document.units[0]?.segments).toEqual([
      { language: "en-US", text: "Home" },
      { language: "de-DE", text: "Startseite" },
      { language: "fr-FR", text: "Accueil" },
    ]);
  });

  it("decodes numeric character references", () => {
    expect(document.units[1]?.segments[1]?.text).toBe("Willkommen zurück, {name}");
    expect(document.units[2]?.segments[1]?.text).toBe("利用規約");
  });

  it("decodes the predefined entities", () => {
    expect(document.units[2]?.segments[0]?.text).toBe("Terms & conditions");
  });

  it("reports no stripped markup, because these segments carry none", () => {
    expect(document.units.map((unit) => unit.markupStripped)).toEqual([false, false, false]);
  });
});

describe("a TMX file using the bare lang attribute, inline markup and CDATA", () => {
  const document = readTmx(fixture("inline-markup-and-cdata.tmx"));

  it("reads the language off the bare lang attribute", () => {
    expect(document.sourceLanguage).toBe("EN");
    expect(document.units[0]?.segments.map((segment) => segment.language)).toEqual(["EN", "DE"]);
  });

  it("flattens inline markup to its text and says the unit lost markup", () => {
    expect(document.units[0]?.segments).toEqual([
      { language: "EN", text: "Save <b>all</b> changes" },
      { language: "DE", text: "Alle <b>Änderungen</b> speichern" },
    ]);
    expect(document.units[0]?.markupStripped).toBe(true);
  });

  it("reads a CDATA segment as text without treating its content as markup", () => {
    expect(document.units[1]?.segments).toEqual([
      { language: "EN", text: "Filter results < 100" },
      { language: "DE", text: "Ergebnisse < 100 filtern" },
    ]);
    expect(document.units[1]?.markupStripped).toBe(false);
  });

  it("keeps a self-closing seg as an empty translation rather than dropping the language", () => {
    expect(document.units[2]?.segments).toEqual([
      { language: "EN", text: "Unsaved draft" },
      { language: "DE", text: "" },
    ]);
  });

  it("keeps a unit that carries only one language", () => {
    expect(document.units[3]?.segments).toEqual([{ language: "EN", text: "Only English here" }]);
  });

  it("keeps a multi-line segment's line breaks and an underscore-spelled language tag", () => {
    expect(document.units[4]?.segments).toEqual([
      { language: "EN", text: "Line one\nLine two" },
      { language: "pt_BR", text: "Linha um\nLinha dois" },
    ]);
  });

  it("skips nothing across the whole file", () => {
    expect(document.units).toHaveLength(5);
    expect(document.skipped).toEqual([]);
  });
});

describe("a TMX file with placeholders in inline markup, a wildcard source language and sentence segmentation", () => {
  const document = readTmx(fixture("placeholders-and-wildcard.tmx"));

  it("reports the TMX all-languages wildcard verbatim rather than inventing a language", () => {
    expect(document.sourceLanguage).toBe("*all*");
  });

  it("keeps a placeholder that was wrapped in inline markup, and says the unit lost markup", () => {
    expect(document.units[0]?.segments).toEqual([
      { language: "en", text: "Welcome back, {{name}}" },
      { language: "de", text: "Willkommen zurück, {{name}}" },
    ]);
    expect(document.units[0]?.markupStripped).toBe(true);
  });

  it("flattens nested inline markup including a sub element", () => {
    expect(document.units[1]?.segments).toEqual([
      { language: "en", text: 'Click <a href="/x">heretooltip text</a> now' },
      { language: "de", text: 'Klicke <a href="/x">hierTooltip-Text</a> jetzt' },
    ]);
    expect(document.units[1]?.markupStripped).toBe(true);
  });

  it("refuses a sentence-segmented unit rather than silently keeping only its first segment", () => {
    expect(document.units).toHaveLength(2);
    expect(document.skipped).toEqual([{ ordinal: 3, reason: "multiple-segments" }]);
  });

  it("leaves nothing unreachable", () => {
    expect(document.unreachableUnits).toBe(0);
  });
});

describe("a TMX file with units outside its first body", () => {
  it("counts them rather than dropping them silently", () => {
    const twoBodies = [
      '<tmx version="1.4">',
      '  <header srclang="en"/>',
      '  <body><tu><tuv xml:lang="en"><seg>In the first body</seg></tuv></tu></body>',
      '  <body><tu><tuv xml:lang="en"><seg>In the second body</seg></tuv></tu></body>',
      "</tmx>",
    ].join("\n");

    const document = readTmx(twoBodies);

    expect(document.units).toHaveLength(1);
    expect(document.unreachableUnits).toBe(1);
  });
});
