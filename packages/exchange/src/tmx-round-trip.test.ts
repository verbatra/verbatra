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

function isHighSurrogate(unit: number): boolean {
  return unit >= 0xd800 && unit <= 0xdbff;
}

function isLowSurrogate(unit: number): boolean {
  return unit >= 0xdc00 && unit <= 0xdfff;
}

function isNoncharacter(point: number): boolean {
  return (point & 0xfffe) === 0xfffe;
}

function isForbiddenUnit(unit: number): boolean {
  const control = unit < 0x20 && unit !== 0x09 && unit !== 0x0a && unit !== 0x0d;
  const c1 = unit >= 0x7f && unit <= 0x9f;
  const arabic = unit >= 0xfdd0 && unit <= 0xfdef;
  return control || c1 || arabic || isNoncharacter(unit);
}

function label(point: number): string {
  return point.toString(16).toUpperCase();
}

function illegalXmlCodePoints(text: string): string[] {
  const found: string[] = [];
  let index = 0;
  while (index < text.length) {
    const unit = text.charCodeAt(index);
    const next = text.charCodeAt(index + 1);
    if (isHighSurrogate(unit) && isLowSurrogate(next)) {
      const point = (unit - 0xd800) * 0x400 + (next - 0xdc00) + 0x10000;
      if (isNoncharacter(point)) {
        found.push(label(point));
      }
      index += 2;
      continue;
    }
    if (isHighSurrogate(unit) || isLowSurrogate(unit) || isForbiddenUnit(unit)) {
      found.push(label(unit));
    }
    index += 1;
  }
  return found;
}

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

  it("survives a second pass for every awkward value, so repeated interchange does not drift", () => {
    const units: readonly TmxExportUnit[] = AWKWARD_VALUES.map(([, value]) => ({
      source: value,
      translations: [{ language: "de", text: value }],
    }));
    const once = buildTmx({ sourceLanguage: "en", toolVersion: "1.0.0", units });
    const reread = readTmx(once);

    expect(reread.units).toHaveLength(AWKWARD_VALUES.length);
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

  it("emits no character a conformant parser would reject", () => {
    const hostile = [
      `lone high surrogate ${String.fromCharCode(0xd800)} here`,
      `lone low surrogate ${String.fromCharCode(0xdc00)} here`,
      `noncharacter ${String.fromCharCode(0xfffe)} here`,
      `noncharacter ${String.fromCharCode(0xffff)} here`,
      `arabic presentation noncharacter ${String.fromCharCode(0xfdd0)} here`,
      `plane one noncharacter ${String.fromCharCode(0xd83f, 0xdffe)} here`,
      `control ${String.fromCharCode(0x07)} here`,
    ];
    const written = buildTmx({
      sourceLanguage: "en",
      units: hostile.map((value) => ({ source: value, translations: [] })),
    });

    expect(illegalXmlCodePoints(written)).toEqual([]);
    expect(readTmx(written).units).toHaveLength(hostile.length);
  });

  it("has an oracle that actually catches what the writer is meant to remove", () => {
    expect(illegalXmlCodePoints(`a${String.fromCharCode(0xd800)}b`)).toEqual(["D800"]);
    expect(illegalXmlCodePoints(`a${String.fromCharCode(0xdc00)}b`)).toEqual(["DC00"]);
    expect(illegalXmlCodePoints(`a${String.fromCharCode(0xfffe)}b`)).toEqual(["FFFE"]);
    expect(illegalXmlCodePoints(`a${String.fromCharCode(0xfdd0)}b`)).toEqual(["FDD0"]);
    expect(illegalXmlCodePoints(`a${String.fromCharCode(0xd83f, 0xdffe)}b`)).toEqual(["1FFFE"]);
    expect(illegalXmlCodePoints(`a${String.fromCharCode(0x07)}b`)).toEqual(["7"]);
    expect(illegalXmlCodePoints("plain 🎉 text\n\tand tabs")).toEqual([]);
  });

  it("keeps a valid astral pair, so the surrogate rule does not eat real text", () => {
    const document = roundTrip([{ source: "flags 🇩🇪 and 🎉", translations: [] }]);

    expect(document.units[0]?.segments[0]?.text).toBe("flags 🇩🇪 and 🎉");
  });
});
