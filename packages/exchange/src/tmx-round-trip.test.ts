import { describe, expect, it } from "vitest";
import { buildTmx, type TmxExportUnit } from "./build-tmx.js";
import { readTmx } from "./read-tmx.js";

const AWKWARD_VALUES: ReadonlyArray<readonly [string, string]> = [
  ["markup in a value", "Read the <b>terms &amp; conditions</b> before you agree"],
  ["a multi-line value", "First line\nSecond line\n\nFourth line"],
  ["a value with a carriage return", "First line\r\nSecond line"],
  ["leading and trailing whitespace", "   padded on both sides   "],
  ["a tab-indented value", "\tindented\twith\ttabs"],
  ["a non-Latin script", "Grüße aus München"],
  ["Japanese", "設定を保存しました"],
  ["Arabic, right to left", "تم حفظ الإعدادات"],
  ["an emoji outside the basic plane", "Saved 🎉 and done"],
  ["an empty translation", ""],
  ["a value that is only whitespace", "   "],
  ["an XML declaration inside a value", '<?xml version="1.0"?>'],
  ["a bare ampersand and an escape that must not double", "AT&T uses &amp; in its markup"],
  ["a CDATA close sequence", "an array index a]]>b"],
  ["a quote and an apostrophe", `She said "yes" and it's done`],
];

function roundTrip(units: readonly TmxExportUnit[]): ReturnType<typeof readTmx> {
  return readTmx(buildTmx({ sourceLanguage: "en", toolVersion: "1.0.0", units }));
}

describe("a TMX document survives being written and read back", () => {
  it.each(AWKWARD_VALUES)("carries %s through unchanged as a source", (_label, value) => {
    const document = roundTrip([{ source: value, translations: [] }]);

    expect(document.units[0]?.segments[0]?.text).toBe(value);
  });

  it.each(AWKWARD_VALUES)("carries %s through unchanged as a translation", (_label, value) => {
    const document = roundTrip([
      { source: "Source", translations: [{ language: "de", text: value }] },
    ]);

    expect(document.units[0]?.segments[1]).toEqual({ language: "de", text: value });
  });

  it("keeps every unit, in order, with its whole language set", () => {
    const units: readonly TmxExportUnit[] = [
      {
        source: "Hello",
        translations: [
          { language: "de", text: "Hallo" },
          { language: "fr", text: "Bonjour" },
        ],
      },
      { source: "Goodbye", translations: [{ language: "de", text: "Tschüss" }] },
    ];

    const document = roundTrip(units);

    expect(document.sourceLanguage).toBe("en");
    expect(document.units.map((unit) => unit.segments)).toEqual([
      [
        { language: "en", text: "Hello" },
        { language: "de", text: "Hallo" },
        { language: "fr", text: "Bonjour" },
      ],
      [
        { language: "en", text: "Goodbye" },
        { language: "de", text: "Tschüss" },
      ],
    ]);
  });

  it("reports no stripped markup, because a written value never becomes structure", () => {
    const document = roundTrip([
      { source: "<ph id='1'/>literal", translations: [{ language: "de", text: "<bpt i='1'/>" }] },
    ]);

    expect(document.units[0]?.markupStripped).toBe(false);
    expect(document.units[0]?.segments).toEqual([
      { language: "en", text: "<ph id='1'/>literal" },
      { language: "de", text: "<bpt i='1'/>" },
    ]);
  });

  it("skips nothing on a document it wrote itself", () => {
    expect(roundTrip([{ source: "Hello", translations: [] }]).skipped).toEqual([]);
  });

  it("writes an empty memory that reads back as an empty memory", () => {
    const document = roundTrip([]);

    expect(document.units).toEqual([]);
    expect(document.skipped).toEqual([]);
    expect(document.sourceLanguage).toBe("en");
  });

  it("survives a second pass, so repeated interchange does not drift", () => {
    const units: readonly TmxExportUnit[] = [
      { source: "Tom & Jerry <b>", translations: [{ language: "de", text: "Tom & Jerry <b>" }] },
    ];
    const once = buildTmx({ sourceLanguage: "en", toolVersion: "1.0.0", units });
    const reread = readTmx(once);
    const twice = buildTmx({
      sourceLanguage: "en",
      toolVersion: "1.0.0",
      units: reread.units.map((unit) => ({
        source: unit.segments[0]?.text ?? "",
        translations: unit.segments.slice(1).map((segment) => ({
          language: segment.language,
          text: segment.text,
        })),
      })),
    });

    expect(twice).toBe(once);
  });
});
