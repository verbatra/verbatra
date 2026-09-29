import { describe, expect, it } from "vitest";
import { type BuildXliffInput, buildXliff, type XliffExportUnit } from "./build-xliff.js";
import { readXliff } from "./read-xliff.js";
import type { InlineSpan, XliffVersion } from "./xliff-vocabulary.js";

const VERSIONS: readonly XliffVersion[] = ["2.0", "1.2"];

function text(value: string): InlineSpan {
  return { kind: "text", text: value };
}

function code(value: string): InlineSpan {
  return { kind: "code", code: value };
}

function unit(overrides: Partial<XliffExportUnit> & Pick<XliffExportUnit, "key">): XliffExportUnit {
  return {
    source: [text("Hello")],
    state: "initial",
    sourceHash: "hash-1",
    notes: [],
    ...overrides,
  };
}

function input(version: XliffVersion, units: readonly XliffExportUnit[]): BuildXliffInput {
  return { version, sourceLanguage: "en", targetLanguage: "pt_br", units };
}

describe.each(VERSIONS)("XLIFF %s round trip", (version) => {
  it("reads back every unit's key, source, target, state and source hash", () => {
    const document = readXliff(
      buildXliff(
        input(version, [
          unit({ key: "home.title", source: [text("Welcome")] }),
          unit({
            key: "greeting",
            source: [text("Hi "), code("{{name}}"), text("!")],
            target: [text("Hallo "), code("{{name}}"), text("!")],
            state: "translated",
            sourceHash: "hash-2",
          }),
          unit({ key: "done", target: [text("Fertig")], state: "reviewed" }),
        ]),
      ),
    );

    expect(document.version).toBe(version);
    expect(document.sourceLanguage).toBe("en");
    expect(document.targetLanguage).toBe("pt-BR");
    expect(document.problems).toEqual([]);
    expect(
      document.units.map(({ key, source, target, state, sourceHash }) => ({
        key,
        source,
        target,
        state,
        sourceHash,
      })),
    ).toEqual([
      {
        key: "home.title",
        source: "Welcome",
        target: undefined,
        state: "initial",
        sourceHash: "hash-1",
      },
      {
        key: "greeting",
        source: "Hi {{name}}!",
        target: "Hallo {{name}}!",
        state: "translated",
        sourceHash: "hash-2",
      },
      { key: "done", source: "Hello", target: "Fertig", state: "reviewed", sourceHash: "hash-1" },
    ]);
  });

  it.each([
    "Tom & Jerry <b>bold</b> \"quoted\" 'single' > <",
    "  leading and trailing  ",
    "line one\nline two\r\nline three\ttabbed",
    "emoji 👋 and CJK 日本語",
    "{count, plural, one {# item} other {# items}}",
    "key with ]]> inside",
  ])("keeps %j byte-exact in text and in inline codes", (value) => {
    const document = readXliff(
      buildXliff(
        input(version, [
          unit({
            key: value,
            source: [text(value), code(value)],
            target: [code(value), text(value)],
          }),
        ]),
      ),
    );

    expect(document.units[0]?.key).toBe(value);
    expect(document.units[0]?.source).toBe(`${value}${value}`);
    expect(document.units[0]?.target).toBe(`${value}${value}`);
  });

  it("keeps a target whose codes are reordered, repeated or new", () => {
    const document = readXliff(
      buildXliff(
        input(version, [
          unit({
            key: "k",
            source: [code("%1$s"), text(" of "), code("%2$s")],
            target: [code("%2$s"), text(" von "), code("%1$s"), code("%1$s"), code("%3$s")],
          }),
        ]),
      ),
    );

    expect(document.units[0]?.target).toBe("%2$s von %1$s%1$s%3$s");
  });

  it("keeps an empty target apart from a missing one", () => {
    const document = readXliff(
      buildXliff(input(version, [unit({ key: "empty", target: [], state: "translated" })])),
    );

    expect(document.units[0]?.target).toBe("");
  });

  it("reads back a document with no unit", () => {
    expect(readXliff(buildXliff(input(version, []))).units).toEqual([]);
  });
});

describe("XLIFF 2.0 round trip of characters XML forbids", () => {
  it("carries a control character through a cp element", () => {
    const value = `bell${String.fromCharCode(7)}ring`;
    const document = readXliff(
      buildXliff(input("2.0", [unit({ key: "k", source: [text(value), code(value)] })])),
    );

    expect(document.units[0]?.source).toBe(`${value}${value}`);
  });
});
