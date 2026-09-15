import { describe, expect, it } from "vitest";
import { ExchangeError } from "./errors.js";
import { readTmx } from "./read-tmx.js";
import { DEFAULT_TMX_LIMITS } from "./tmx-limits.js";

function tmx(body: string, srclang = "en"): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<tmx version="1.4">',
    `  <header srclang="${srclang}" creationtool="probe" creationtoolversion="1" segtype="block" o-tmf="probe" adminlang="en" datatype="plaintext"/>`,
    "  <body>",
    body,
    "  </body>",
    "</tmx>",
  ].join("\n");
}

function unit(pairs: ReadonlyArray<readonly [string, string]>): string {
  const tuvs = pairs
    .map(([lang, seg]) => `    <tuv xml:lang="${lang}"><seg>${seg}</seg></tuv>`)
    .join("\n");
  return `  <tu>\n${tuvs}\n  </tu>`;
}

function expectTmxInvalid(action: () => unknown): ExchangeError {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(ExchangeError);
    expect((error as ExchangeError).code).toBe("TMX_INVALID");
    return error as ExchangeError;
  }
  throw new Error("expected the read to throw a TMX_INVALID error");
}

describe("readTmx reads plain-text translation units", () => {
  it("reports the header source language", () => {
    expect(readTmx(tmx(unit([["en", "Hello"]]), "en-US")).sourceLanguage).toBe("en-US");
  });

  it("returns one unit per tu with one segment per tuv", () => {
    const document = readTmx(
      tmx(
        [
          unit([
            ["en", "Hello"],
            ["de", "Hallo"],
          ]),
          unit([
            ["en", "Goodbye"],
            ["de", "Auf Wiedersehen"],
          ]),
        ].join("\n"),
      ),
    );

    expect(document.units).toEqual([
      {
        ordinal: 1,
        markupStripped: false,
        segments: [
          { language: "en", text: "Hello" },
          { language: "de", text: "Hallo" },
        ],
      },
      {
        ordinal: 2,
        markupStripped: false,
        segments: [
          { language: "en", text: "Goodbye" },
          { language: "de", text: "Auf Wiedersehen" },
        ],
      },
    ]);
  });

  it("decodes the predefined entities rather than passing them through", () => {
    const document = readTmx(tmx(unit([["en", "Tom &amp; Jerry &lt;b&gt; &quot;x&quot;"]])));

    expect(document.units[0]?.segments[0]?.text).toBe('Tom & Jerry <b> "x"');
  });

  it("keeps a segment that is only whitespace exactly as written", () => {
    const document = readTmx(tmx(unit([["en", "  padded  "]])));

    expect(document.units[0]?.segments[0]?.text).toBe("  padded  ");
  });

  it("reads an empty translation as an empty segment rather than dropping the language", () => {
    const document = readTmx(
      tmx(
        '  <tu>\n    <tuv xml:lang="en"><seg>Hello</seg></tuv>\n    <tuv xml:lang="de"><seg/></tuv>\n  </tu>',
      ),
    );

    expect(document.units[0]?.segments).toEqual([
      { language: "en", text: "Hello" },
      { language: "de", text: "" },
    ]);
  });

  it("reads a CDATA segment as its text", () => {
    const document = readTmx(
      tmx('  <tu>\n    <tuv xml:lang="en"><seg><![CDATA[a < b & c]]></seg></tuv>\n  </tu>'),
    );

    expect(document.units[0]?.segments[0]?.text).toBe("a < b & c");
  });

  it("accepts the lang attribute older writers emit instead of xml:lang", () => {
    const document = readTmx(tmx('  <tu>\n    <tuv lang="fr"><seg>Bonjour</seg></tuv>\n  </tu>'));

    expect(document.units[0]?.segments).toEqual([{ language: "fr", text: "Bonjour" }]);
  });

  it("ignores the prop and note children tools attach to a unit", () => {
    const document = readTmx(
      tmx(
        '  <tu tuid="42" creationdate="20240101T000000Z">\n' +
          '    <prop type="x-origin">memory</prop>\n' +
          "    <note>context for the translator</note>\n" +
          '    <tuv xml:lang="en"><seg>Hello</seg></tuv>\n' +
          "  </tu>",
      ),
    );

    expect(document.units[0]?.segments).toEqual([{ language: "en", text: "Hello" }]);
  });

  it("flattens inline markup to its text and says so on the unit", () => {
    const document = readTmx(
      tmx(
        '  <tu>\n    <tuv xml:lang="en"><seg>Hello <bpt i="1">&lt;b&gt;</bpt>world<ept i="1">&lt;/b&gt;</ept></seg></tuv>\n  </tu>',
      ),
    );

    expect(document.units[0]?.segments[0]?.text).toBe("Hello <b>world</b>");
    expect(document.units[0]?.markupStripped).toBe(true);
  });

  it("skips and counts a unit whose tuv carries no seg", () => {
    const document = readTmx(tmx('  <tu>\n    <tuv xml:lang="en"></tuv>\n  </tu>'));

    expect(document.units).toEqual([]);
    expect(document.skipped).toEqual([{ ordinal: 1, reason: "no-segment" }]);
  });

  it("skips and counts a unit whose tuv declares no language", () => {
    const document = readTmx(tmx("  <tu>\n    <tuv><seg>Hello</seg></tuv>\n  </tu>"));

    expect(document.units).toEqual([]);
    expect(document.skipped).toEqual([{ ordinal: 1, reason: "language-missing" }]);
  });

  it("skips and counts a unit that repeats one language", () => {
    const document = readTmx(
      tmx(
        '  <tu>\n    <tuv xml:lang="de"><seg>Hallo</seg></tuv>\n    <tuv xml:lang="de"><seg>Moin</seg></tuv>\n  </tu>',
      ),
    );

    expect(document.units).toEqual([]);
    expect(document.skipped).toEqual([{ ordinal: 1, reason: "duplicate-language" }]);
  });

  it("keeps the units either side of a skipped one", () => {
    const document = readTmx(
      tmx(
        [
          unit([["en", "first"]]),
          '  <tu>\n    <tuv xml:lang="en"></tuv>\n  </tu>',
          unit([["en", "third"]]),
        ].join("\n"),
      ),
    );

    expect(document.units.map((each) => each.ordinal)).toEqual([1, 3]);
    expect(document.skipped).toEqual([{ ordinal: 2, reason: "no-segment" }]);
  });
});

describe("readTmx refuses a hostile or unusable document", () => {
  it("names the size limit when the input is oversized", () => {
    const error = expectTmxInvalid(() =>
      readTmx(tmx(unit([["en", "x"]])), { limits: { ...DEFAULT_TMX_LIMITS, maxInputBytes: 16 } }),
    );

    expect(error.message).toContain("16 bytes");
  });

  it("refuses an inline entity declaration rather than expanding it", () => {
    const billionLaughs = [
      '<?xml version="1.0"?>',
      "<!DOCTYPE tmx [",
      '  <!ENTITY lol "lol">',
      '  <!ENTITY lol1 "&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;">',
      '  <!ENTITY lol2 "&lol1;&lol1;&lol1;&lol1;&lol1;&lol1;&lol1;&lol1;&lol1;&lol1;">',
      "]>",
      '<tmx version="1.4"><header srclang="en"/><body>',
      '<tu><tuv xml:lang="en"><seg>&lol2;</seg></tuv></tu>',
      "</body></tmx>",
    ].join("\n");

    const error = expectTmxInvalid(() => readTmx(billionLaughs));

    expect(error.message).toContain("entity");
  });

  it("refuses an external entity reference rather than reading the file it names", () => {
    const xxe = [
      '<?xml version="1.0"?>',
      '<!DOCTYPE tmx [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>',
      '<tmx version="1.4"><header srclang="en"/><body>',
      '<tu><tuv xml:lang="en"><seg>&xxe;</seg></tuv></tu>',
      "</body></tmx>",
    ].join("\n");

    const error = expectTmxInvalid(() => readTmx(xxe));

    expect(error.message).toContain("entity");
  });

  it("refuses an entity declaration that stands outside any internal subset", () => {
    const loose = [
      '<!ENTITY xxe SYSTEM "file:///etc/passwd">',
      '<tmx version="1.4"><header srclang="en"/><body>',
      '<tu><tuv xml:lang="en"><seg>Hello</seg></tuv></tu>',
      "</body></tmx>",
    ].join("\n");

    const error = expectTmxInvalid(() => readTmx(loose));

    expect(error.message).toContain("entity");
  });

  it("refuses an internal subset even when it declares no entity", () => {
    const withSubset = [
      "<!DOCTYPE tmx [<!ELEMENT seg (#PCDATA)>]>",
      '<tmx version="1.4"><header srclang="en"/><body>',
      '<tu><tuv xml:lang="en"><seg>Hello</seg></tuv></tu>',
      "</body></tmx>",
    ].join("\n");

    expectTmxInvalid(() => readTmx(withSubset));
  });

  it("accepts the bare external doctype real writers emit, without resolving it", () => {
    const withDoctype = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<!DOCTYPE tmx SYSTEM "tmx14.dtd">',
      '<tmx version="1.4"><header srclang="en"/><body>',
      '<tu><tuv xml:lang="en"><seg>Hello</seg></tuv></tu>',
      "</body></tmx>",
    ].join("\n");

    expect(readTmx(withDoctype).units[0]?.segments).toEqual([{ language: "en", text: "Hello" }]);
  });

  it("refuses a DOCTYPE declaration that is never closed", () => {
    const error = expectTmxInvalid(() => readTmx('<!DOCTYPE tmx SYSTEM "tmx14.dtd"'));

    expect(error.message).toContain("DOCTYPE");
  });

  it("refuses a truncated document with a structured error", () => {
    const error = expectTmxInvalid(() => readTmx('<tmx version="1.4"><body><tu><tuv'));

    expect(error.message).toContain("not valid XML");
  });

  it("refuses a document whose root element is not tmx, even when it has a body", () => {
    const error = expectTmxInvalid(() =>
      readTmx('<xliff><body><tu><tuv xml:lang="en"><seg>Hello</seg></tuv></tu></body></xliff>'),
    );

    expect(error.message).toContain("root element is not");
  });

  it("refuses a document with no body element", () => {
    expectTmxInvalid(() => readTmx('<tmx version="1.4"><header srclang="en"/></tmx>'));
  });

  it("names the unit limit when the body holds too many units", () => {
    const body = [unit([["en", "a"]]), unit([["en", "b"]]), unit([["en", "c"]])].join("\n");
    const error = expectTmxInvalid(() =>
      readTmx(tmx(body), { limits: { ...DEFAULT_TMX_LIMITS, maxUnitCount: 2 } }),
    );

    expect(error.message).toContain("2");
  });

  it("names the segment limit when a segment is too long", () => {
    const error = expectTmxInvalid(() =>
      readTmx(tmx(unit([["en", "abcdefghij"]])), {
        limits: { ...DEFAULT_TMX_LIMITS, maxSegmentLength: 4 },
      }),
    );

    expect(error.message).toContain("4");
  });

  it("names the language limit when a unit carries too many languages", () => {
    const pairs: Array<readonly [string, string]> = [
      ["en", "a"],
      ["de", "b"],
      ["fr", "c"],
    ];
    const error = expectTmxInvalid(() =>
      readTmx(tmx(unit(pairs)), { limits: { ...DEFAULT_TMX_LIMITS, maxLanguagesPerUnit: 2 } }),
    );

    expect(error.message).toContain("2");
  });

  it("reads a document that starts with a byte order mark", () => {
    const withBom = `\ufeff${tmx(unit([["en", "Hello"]]))}`;

    expect(readTmx(withBom).units[0]?.segments).toEqual([{ language: "en", text: "Hello" }]);
  });

  it("refuses a segment carrying a character XML 1.0 forbids", () => {
    const control = `<tmx version="1.4"><header srclang="en"/><body><tu><tuv xml:lang="en"><seg>a${String.fromCharCode(
      7,
    )}b</seg></tuv></tu></body></tmx>`;

    expectTmxInvalid(() => readTmx(control));
  });
});
