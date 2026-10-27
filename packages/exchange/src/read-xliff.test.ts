import { describe, expect, it } from "vitest";
import { ExchangeError } from "./errors.js";
import { DEFAULT_XLIFF_LIMITS, readXliff } from "./read-xliff.js";

function xliff2(units: string, root = 'version="2.0" srcLang="en" trgLang="de"'): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<xliff xmlns="urn:oasis:names:tc:xliff:document:2.0" xmlns:mda="urn:oasis:names:tc:xliff:metadata:2.0" ${root}>`,
    '<file id="f1">',
    units,
    "</file>",
    "</xliff>",
  ].join("\n");
}

function xliff12(
  units: string,
  namespace = ' xmlns="urn:oasis:names:tc:xliff:document:1.2"',
): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<xliff${namespace} version="1.2">`,
    '<file original="x" datatype="plaintext" source-language="en" target-language="fr"><body>',
    units,
    "</body></file>",
    "</xliff>",
  ].join("\n");
}

function refusal(read: () => unknown): ExchangeError {
  try {
    read();
  } catch (error) {
    expect(error).toBeInstanceOf(ExchangeError);
    expect((error as ExchangeError).code).toBe("XLIFF_INVALID");
    return error as ExchangeError;
  }
  throw new Error("expected the read to throw an XLIFF_INVALID error");
}

describe("readXliff: XLIFF 2 as a CAT tool returns it", () => {
  it("reads a unit whose attributes were reordered and whose target a tool filled", () => {
    const document = readXliff(
      xliff2(
        [
          '<unit name="greeting" id="u1">',
          '<mda:metadata><mda:metaGroup category="verbatra"><mda:meta type="source-hash">h</mda:meta></mda:metaGroup></mda:metadata>',
          '<originalData><data id="d1">{{name}}</data></originalData>',
          '<segment state="final"><source>Hi <ph id="1" dataRef="d1"/></source>',
          '<target>Salut <ph equiv="x" dataRef="d1" id="1"/></target></segment>',
          "</unit>",
        ].join(""),
      ),
    );

    expect(document.units).toEqual([
      {
        ordinal: 1,
        line: 4,
        key: "greeting",
        source: "Hi {{name}}",
        target: "Salut {{name}}",
        state: "final",
        sourceHash: "h",
      },
    ]);
    expect(document.targetLanguage).toBe("de");
  });

  it("joins segments and ignorables a tool split the unit into, taking the lowest state", () => {
    const document = readXliff(
      xliff2(
        [
          '<unit id="u1" name="k">',
          '<segment state="reviewed"><source>One.</source><target>Eins.</target></segment>',
          "<ignorable><source> </source></ignorable>",
          '<segment state="translated"><source>Two.</source><target>Zwei.</target></segment>',
          "</unit>",
        ].join(""),
      ),
    );

    expect(document.units[0]).toMatchObject({
      source: "One. Two.",
      target: "Eins. Zwei.",
      state: "translated",
    });
  });

  it("reads a unit with a target missing from one segment as having no target", () => {
    const document = readXliff(
      xliff2(
        [
          '<unit id="u1" name="k">',
          '<segment state="translated"><source>One.</source><target>Eins.</target></segment>',
          "<segment><source>Two.</source></segment>",
          "</unit>",
        ].join(""),
      ),
    );

    expect(document.units[0]).toMatchObject({ target: undefined, state: "initial" });
  });

  it("resolves paired and spanning codes, markers, annotations and code points", () => {
    const document = readXliff(
      xliff2(
        [
          '<unit id="u1" name="k">',
          '<originalData><data id="a">&lt;b&gt;</data><data id="b">&lt;/b&gt;</data><data id="c">x<cp hex="7"/></data></originalData>',
          '<segment><source><pc id="1" dataRefStart="a" dataRefEnd="b">bold</pc></source>',
          '<target><sc id="1" dataRef="a"/><mrk id="m1" translate="yes">fett</mrk><sm id="s"/><em startRef="s"/><ec startRef="1" dataRef="b"/><ph id="9" dataRef="c"/><cp hex="1F600"/></target></segment>',
          "</unit>",
        ].join(""),
      ),
    );

    expect(document.units[0]).toMatchObject({
      source: "<b>bold</b>",
      target: `<b>fett</b>x${String.fromCharCode(7)}\u{1F600}`,
    });
  });

  it("falls back to equiv when a tool dropped the original data", () => {
    const document = readXliff(
      xliff2(
        '<unit id="u1" name="k"><segment><source><ph id="1" dataRef="d1" equiv="{n}"/><pc id="2" equivStart="[" equivEnd="]">x</pc><ph id="3"/></source></segment></unit>',
      ),
    );

    expect(document.units[0]?.source).toBe("{n}[x]");
  });

  it("walks nested groups and every file in document order", () => {
    const document = readXliff(
      [
        '<xliff xmlns="urn:oasis:names:tc:xliff:document:2.0" version="2.1" srcLang="en">',
        '<file id="f1"><group id="g1"><unit id="a"><segment><source>A</source></segment></unit>',
        '<group id="g2"><unit id="b"><segment><source>B</source></segment></unit></group></group>',
        '<unit id="c"><segment><source>C</source></segment></unit></file>',
        '<file id="f2"><unit id="d"><segment><source>D</source></segment></unit></file>',
        "</xliff>",
      ].join(""),
    );

    expect(document.units.map((unit) => [unit.ordinal, unit.key])).toEqual([
      [1, "a"],
      [2, "b"],
      [3, "c"],
      [4, "d"],
    ]);
    expect(document.targetLanguage).toBeUndefined();
  });

  it("reads the source hash from a nested meta group, and none from another category", () => {
    const document = readXliff(
      xliff2(
        [
          '<unit id="a"><mda:metadata><mda:metaGroup category="other"><mda:meta type="source-hash">no</mda:meta></mda:metaGroup>',
          '<mda:metaGroup category="verbatra"><mda:metaGroup><mda:meta type="note">n</mda:meta><mda:meta type="source-hash">yes</mda:meta></mda:metaGroup></mda:metaGroup></mda:metadata>',
          "<segment><source>A</source></segment></unit>",
          '<unit id="b"><metadata xmlns="urn:example"><metaGroup category="verbatra"><meta type="source-hash">foreign</meta></metaGroup></metadata>',
          '<mda:metadata><mda:metaGroup category="verbatra"><mda:meta type="other">x</mda:meta></mda:metaGroup></mda:metadata>',
          "<segment><source>B</source></segment></unit>",
        ].join(""),
      ),
    );

    expect(document.units.map((unit) => unit.sourceHash)).toEqual(["yes", undefined]);
  });

  it("maps every state spelling, defaulting an unknown or absent one to initial", () => {
    const states = ["initial", "translated", "reviewed", "final", "x-custom"];
    const document = readXliff(
      xliff2(
        [
          ...states.map(
            (state) =>
              `<unit id="${state}"><segment state="${state}"><source>s</source><target>t</target></segment></unit>`,
          ),
          '<unit id="none"><segment><source>s</source><target>t</target></segment></unit>',
        ].join(""),
      ),
    );

    expect(document.units.map((unit) => unit.state)).toEqual([
      "initial",
      "translated",
      "reviewed",
      "final",
      "initial",
      "initial",
    ]);
  });

  it("reports a unit it cannot map or decode instead of refusing the file", () => {
    const document = readXliff(
      xliff2(
        [
          '<unit id=""><segment><source>no key</source></segment></unit>',
          '<unit id="bad-source"><segment><source><unknown/></source></segment></unit>',
          '<unit id="bad-target"><segment><source>s</source><target><ph id="1" dataRef="missing"/></target></segment></unit>',
          '<unit id="bad-cp"><segment><source>s</source><target><cp hex="zz"/></target></segment></unit>',
          '<unit id="no-segment"><notes><note>n</note></notes></unit>',
          '<unit id="data-with-markup"><originalData><data id="d1"><b/></data></originalData><segment><source><ph id="1" dataRef="d1"/></source></segment></unit>',
          '<unit id="fine"><segment><source>ok</source></segment></unit>',
        ].join("\n"),
      ),
    );

    expect(document.problems).toEqual([
      { ordinal: 1, line: 4, field: "id" },
      { ordinal: 2, line: 5, field: "source" },
      { ordinal: 3, line: 6, field: "target" },
      { ordinal: 4, line: 7, field: "target" },
      { ordinal: 5, line: 8, field: "source" },
      { ordinal: 6, line: 9, field: "source" },
    ]);
    expect(document.units.map((unit) => unit.key)).toEqual(["fine"]);
  });
});

describe("readXliff: XLIFF 1.2 as a CAT tool returns it", () => {
  it("reads resname, native code content, extradata hash and target state", () => {
    const document = readXliff(
      xliff12(
        [
          '<trans-unit extradata="verbatra-source-hash:abc" resname="home.title" id="1">',
          '<source>Hi <ph id="1">{{name}}</ph></source>',
          '<target state="translated">Salut <ph id="1" ctype="x-other">{{name}}</ph></target>',
          "</trans-unit>",
        ].join(""),
      ),
    );

    expect(document.version).toBe("1.2");
    expect(document.sourceLanguage).toBe("en");
    expect(document.targetLanguage).toBe("fr");
    expect(document.units[0]).toMatchObject({
      key: "home.title",
      source: "Hi {{name}}",
      target: "Salut {{name}}",
      state: "translated",
      sourceHash: "abc",
    });
  });

  it.each([
    ["new", undefined, "initial"],
    ["needs-translation", undefined, "initial"],
    ["needs-review-translation", undefined, "initial"],
    ["translated", undefined, "translated"],
    ["signed-off", undefined, "reviewed"],
    ["final", undefined, "final"],
    ["translated", "yes", "reviewed"],
    ["new", "yes", "reviewed"],
    ["final", "yes", "final"],
    ["translated", "no", "translated"],
  ])("maps state %s with approved=%s to %s", (state, approved, expected) => {
    const approval = approved === undefined ? "" : ` approved="${approved}"`;
    const document = readXliff(
      xliff12(
        `<trans-unit id="k"${approval}><source>s</source><target state="${state}">t</target></trans-unit>`,
      ),
    );

    expect(document.units[0]?.state).toBe(expected);
  });

  it("reads a target with no state as initial and a unit with no target as having none", () => {
    const document = readXliff(
      xliff12(
        '<trans-unit id="a"><source>s</source><target>t</target></trans-unit><trans-unit id="b"><source>s</source></trans-unit>',
      ),
    );

    expect(document.units.map((unit) => [unit.state, unit.target])).toEqual([
      ["initial", "t"],
      ["initial", undefined],
    ]);
  });

  it("resolves paired tags, markers and codes carrying only an equivalent text", () => {
    const document = readXliff(
      xliff12(
        [
          '<trans-unit id="k"><source><bpt id="1">&lt;b&gt;</bpt>x<ept id="1">&lt;/b&gt;</ept><it id="2" pos="open">&lt;i&gt;</it></source>',
          '<target><g id="3"><mrk mtype="seg" mid="1">y</mrk></g><x id="4" equiv-text="{a}"/><bx id="5" equiv-text="["/><ex id="6" equiv-text="]"/><ph id="7">%s<sub>ignored</sub></ph></target></trans-unit>',
        ].join(""),
      ),
    );

    expect(document.units[0]).toMatchObject({ source: "<b>x</b><i>", target: "y{a}[]%s" });
  });

  it("walks groups, reads a document without the namespace, and skips a file without a body", () => {
    const document = readXliff(
      [
        '<xliff version="1.2"><file original="a" datatype="plaintext" source-language="en"/>',
        '<file original="b" datatype="plaintext" source-language="en"><body><group id="g"><trans-unit id="a"><source>A</source></trans-unit>',
        '<bin-unit id="bin"/></group><trans-unit id="b"><source>B</source></trans-unit></body></file></xliff>',
      ].join(""),
    );

    expect(document.units.map((unit) => unit.key)).toEqual(["a", "b"]);
    expect(document.targetLanguage).toBeUndefined();
  });

  it("reads no languages from a document with no file", () => {
    expect(readXliff('<xliff version="1.2"/>')).toMatchObject({
      sourceLanguage: undefined,
      targetLanguage: undefined,
      units: [],
    });
  });

  it("ignores an extradata another tool wrote, and reports undecodable content", () => {
    const document = readXliff(
      xliff12(
        [
          '<trans-unit id="a" extradata="other-tool:1"><source>s</source></trans-unit>',
          '<trans-unit id="b"><source>s</source><target><x id="1"/></target></trans-unit>',
          '<trans-unit id="c"><source><unknown/></source></trans-unit>',
          '<trans-unit id="d"><target>no source</target></trans-unit>',
        ].join("\n"),
      ),
    );

    expect(document.units.map((unit) => [unit.key, unit.sourceHash])).toEqual([["a", undefined]]);
    expect(document.problems.map((problem) => problem.field)).toEqual([
      "target",
      "source",
      "source",
    ]);
  });
});

describe("readXliff: refusals", () => {
  it("refuses a root that is not xliff", () => {
    expect(refusal(() => readXliff("<tmx/>")).message).toContain("root element is not <xliff>");
  });

  it.each([
    ['<xliff version="3.0" xmlns="urn:oasis:names:tc:xliff:document:2.0"/>', 'version "3.0"'],
    ['<xliff version="2.0"/>', 'version "2.0" in the namespace ""'],
    ['<xliff xmlns="urn:example" version="1.2"/>', 'namespace "urn:example"'],
    ["<xliff/>", 'version ""'],
  ])("refuses %s", (text, detail) => {
    expect(refusal(() => readXliff(text)).message).toContain(detail);
  });

  it("refuses an entity declaration before parsing", () => {
    const text = '<!DOCTYPE xliff [<!ENTITY x SYSTEM "file:///etc/passwd">]><xliff version="1.2"/>';
    expect(refusal(() => readXliff(text)).message).toContain("internal DTD subset");
  });

  it("refuses an entity declared outside a DTD", () => {
    expect(refusal(() => readXliff('<!ENTITY x "y"><xliff version="1.2"/>')).code).toBe(
      "XLIFF_INVALID",
    );
  });

  it("reads past an external DOCTYPE and a byte order mark", () => {
    const text = `﻿<!DOCTYPE xliff SYSTEM "xliff.dtd"><xliff version="1.2"/>`;
    expect(readXliff(text).units).toEqual([]);
  });

  it("refuses a file that is not well-formed XML, naming where", () => {
    const error = refusal(() => readXliff(xliff12('<trans-unit id="a"><source>open</trans-unit>')));
    expect(error.message).toContain("The XLIFF file is not valid XML");
    expect(error.location?.unit).toBe(1);
  });

  it("refuses a file over the byte limit", () => {
    const limits = { ...DEFAULT_XLIFF_LIMITS, maxInputBytes: 10 };
    expect(refusal(() => readXliff(xliff12(""), { limits })).message).toContain(
      "larger than the maximum of 10 bytes",
    );
  });

  it("refuses more units than the limit", () => {
    const limits = { ...DEFAULT_XLIFF_LIMITS, maxUnitCount: 1 };
    const text = xliff12(
      '<trans-unit id="a"><source>A</source></trans-unit><trans-unit id="b"><source>B</source></trans-unit>',
    );
    expect(refusal(() => readXliff(text, { limits })).message).toContain("maximum of 1 units");
  });

  it.each([
    ['<trans-unit id="a"><source>too long</source></trans-unit>'],
    ['<trans-unit id="a"><source>s</source><target>too long</target></trans-unit>'],
  ])("refuses a segment over the length limit in %s", (units) => {
    const limits = { ...DEFAULT_XLIFF_LIMITS, maxSegmentLength: 5 };
    const error = refusal(() => readXliff(xliff12(units), { limits }));
    expect(error.message).toContain("longer than the maximum of 5 characters");
    expect(error.location?.unit).toBe(1);
  });
});
