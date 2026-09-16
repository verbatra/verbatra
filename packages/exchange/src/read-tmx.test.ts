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
        subflowDropped: false,
        segments: [
          { language: "en", text: "Hello" },
          { language: "de", text: "Hallo" },
        ],
      },
      {
        ordinal: 2,
        markupStripped: false,
        subflowDropped: false,
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

  it("leaves a sub element's text out of the segment and flags the unit", () => {
    const document = readTmx(
      tmx(
        '  <tu>\n    <tuv xml:lang="en"><seg>Open <ph>&lt;a title="<sub>A tooltip</sub>"&gt;</ph>the link</seg></tuv>\n  </tu>',
      ),
    );

    expect(document.units[0]?.segments[0]?.text).toBe('Open <a title="">the link');
    expect(document.units[0]?.markupStripped).toBe(true);
    expect(document.units[0]?.subflowDropped).toBe(true);
  });

  it("leaves out every level of a sub element nested inside another's markup", () => {
    const document = readTmx(
      tmx(
        '  <tu>\n    <tuv xml:lang="en"><seg>a<bpt i="1">[<sub>b<ph>c<sub>d</sub></ph>e</sub>]</bpt>f</seg></tuv>\n  </tu>',
      ),
    );

    expect(document.units[0]?.segments[0]?.text).toBe("a[]f");
    expect(document.units[0]?.subflowDropped).toBe(true);
  });

  it("does not flag a unit whose markup carries no sub element", () => {
    const document = readTmx(
      tmx(
        '  <tu>\n    <tuv xml:lang="en"><seg>Hello <ph><![CDATA[<br/>]]></ph>world<!-- note --></seg></tuv>\n  </tu>',
      ),
    );

    expect(document.units[0]?.segments[0]?.text).toBe("Hello <br/>world");
    expect(document.units[0]?.subflowDropped).toBe(false);
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

  it("refuses an entity declaration hiding after a legitimate external doctype", () => {
    const layered = [
      '<!DOCTYPE tmx SYSTEM "tmx14.dtd">',
      '<!ENTITY xxe SYSTEM "file:///etc/passwd">',
      '<tmx version="1.4"><header srclang="en"/><body>',
      '<tu><tuv xml:lang="en"><seg>Hello</seg></tuv></tu>',
      "</body></tmx>",
    ].join("\n");

    expect(expectTmxInvalid(() => readTmx(layered)).message).toContain("entity");
  });

  it("refuses a second DOCTYPE that carries an internal subset", () => {
    const two = [
      '<!DOCTYPE tmx SYSTEM "tmx14.dtd">',
      "<!DOCTYPE tmx [<!ELEMENT seg (#PCDATA)>]>",
      '<tmx version="1.4"><header srclang="en"/><body>',
      '<tu><tuv xml:lang="en"><seg>Hello</seg></tuv></tu>',
      "</body></tmx>",
    ].join("\n");

    expect(expectTmxInvalid(() => readTmx(two)).message).toContain("internal DTD subset");
  });

  it("does not mistake a greater-than inside a system identifier for the end of the doctype", () => {
    const quoted = [
      '<!DOCTYPE tmx SYSTEM "a>b.dtd">',
      '<tmx version="1.4"><header srclang="en"/><body>',
      '<tu><tuv xml:lang="en"><seg>Hello</seg></tuv></tu>',
      "</body></tmx>",
    ].join("\n");

    expect(readTmx(quoted).units[0]?.segments).toEqual([{ language: "en", text: "Hello" }]);
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

describe("readTmx bounds the prolog itself", () => {
  it("skips a comment and a processing instruction before the root element", () => {
    const decorated = [
      '<?xml version="1.0"?>',
      "<!-- exported nightly, do not edit -->",
      '<?xml-stylesheet href="tmx.xsl"?>',
      '<!DOCTYPE tmx SYSTEM "tmx14.dtd">',
      "<!-- second comment -->",
      '<tmx version="1.4"><header srclang="en"/><body>',
      '<tu><tuv xml:lang="en"><seg>Hello</seg></tuv></tu>',
      "</body></tmx>",
    ].join("\n");

    expect(readTmx(decorated).units[0]?.segments).toEqual([{ language: "en", text: "Hello" }]);
  });

  it("refuses a comment that is never closed", () => {
    expect(expectTmxInvalid(() => readTmx("<!-- never closed <tmx/>")).message).toContain("-->");
  });

  it("refuses a processing instruction that is never closed", () => {
    expect(expectTmxInvalid(() => readTmx('<?xml version="1.0"')).message).toContain("?>");
  });

  it("refuses text sitting before the root element", () => {
    expect(expectTmxInvalid(() => readTmx('stray text<tmx version="1.4"/>')).message).toContain(
      "before the root element",
    );
  });

  it("refuses a document with no root element at all", () => {
    expect(expectTmxInvalid(() => readTmx("<!-- only a comment -->")).message).toContain(
      "no root element",
    );
  });

  it("refuses a tmx root element in a foreign namespace", () => {
    const foreign =
      '<tmx xmlns="http://example.invalid/not-tmx" version="1.4"><header srclang="en"/><body/></tmx>';

    expect(expectTmxInvalid(() => readTmx(foreign)).message).toContain("namespace");
  });

  it("accepts the TMX 1.4 namespace when a writer declares it", () => {
    const namespaced =
      '<tmx xmlns="http://www.lisa.org/tmx14" version="1.4"><header srclang="en"/><body>' +
      '<tu><tuv xml:lang="en"><seg>Hello</seg></tuv></tu></body></tmx>';

    expect(readTmx(namespaced).units[0]?.segments).toEqual([{ language: "en", text: "Hello" }]);
  });

  it("refuses a well-formedness error the parser reports without calling it fatal", () => {
    const undeclared =
      '<tmx version="1.4"><header srclang="en"/><body>' +
      '<tu><tuv xml:lang="en"><seg>fifty &percnt; off</seg></tuv></tu></body></tmx>';

    expect(expectTmxInvalid(() => readTmx(undeclared)).message).toContain("not valid XML");
  });
});

describe("readTmx refuses an entity declaration the prolog scan walks past", () => {
  it("catches one hidden inside a prolog comment", () => {
    const hidden = [
      '<!-- a stray <!ENTITY xxe SYSTEM "file:///etc/passwd"> left in a comment -->',
      '<tmx version="1.4"><header srclang="en"/><body>',
      '<tu><tuv xml:lang="en"><seg>Hello</seg></tuv></tu>',
      "</body></tmx>",
    ].join("\n");

    expect(expectTmxInvalid(() => readTmx(hidden)).message).toContain("entity");
  });

  it("leaves a raw entity declaration inside a data section alone, because it is payload", () => {
    const inCdata = [
      '<tmx version="1.4"><header srclang="en"/><body>',
      '<tu><tuv xml:lang="en"><seg><![CDATA[Declare it with <!ENTITY name "value"> in the DTD]]></seg></tuv></tu>',
      "</body></tmx>",
    ].join("\n");

    expect(readTmx(inCdata).units[0]?.segments[0]?.text).toBe(
      'Declare it with <!ENTITY name "value"> in the DTD',
    );
  });

  it("keeps a raw doctype inside a data section byte for byte", () => {
    const inCdata = [
      '<tmx version="1.4"><header srclang="en"/><body>',
      '<tu><tuv xml:lang="en"><seg><![CDATA[Write <!DOCTYPE html> at the top, then <body> follows]]></seg></tuv></tu>',
      "</body></tmx>",
    ].join("\n");

    expect(readTmx(inCdata).units[0]?.segments[0]?.text).toBe(
      "Write <!DOCTYPE html> at the top, then <body> follows",
    );
  });

  it("leaves the same words alone when they sit in a segment rather than the prolog", () => {
    const inData = [
      '<tmx version="1.4"><header srclang="en"/><body>',
      '<tu><tuv xml:lang="en"><seg>Declare it with &lt;!ENTITY name "value"&gt; in the DTD</seg></tuv></tu>',
      "</body></tmx>",
    ].join("\n");

    expect(readTmx(inData).units[0]?.segments[0]?.text).toBe(
      'Declare it with <!ENTITY name "value"> in the DTD',
    );
  });
});

describe("readTmx says where in the file a refusal happened", () => {
  const LINES = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<tmx version="1.4">',
    '  <header srclang="en"/>',
    "  <body>",
    "  <tu>",
    '    <tuv xml:lang="en"><seg>a</seg></tuv>',
    "  </tu>",
    "  <tu>",
    '    <tuv xml:lang="en"><seg>bbbbbb</seg></tuv>',
    "  </tu>",
    "  </body>",
    "</tmx>",
  ];

  function withLine(index: number, replacement: string): string {
    return LINES.map((line, at) => (at === index ? replacement : line)).join("\n");
  }

  it("locates a mismatched closing tag in the second unit", () => {
    const error = expectTmxInvalid(() =>
      readTmx(withLine(8, '    <tuv xml:lang="en"><seg>bbbbbb</tuv>')),
    );

    expect(error.location).toEqual({ line: 9, column: 29, unit: 2 });
    expect(error.message).toContain("line 9, column 29, unit 2");
    expect(error.message).toContain("not valid XML");
    expect(error.message).toContain("tag mismatch");
  });

  it("locates a truncated file at the point the text ran out, in a message of its own", () => {
    const truncated = LINES.slice(0, 6).join("\n").slice(0, -12);
    const mismatch = expectTmxInvalid(() =>
      readTmx(withLine(8, '    <tuv xml:lang="en"><seg>bbbbbb</tuv>')),
    );

    const error = expectTmxInvalid(() => readTmx(truncated));

    expect(error.location).toEqual({ line: 6, column: 24, unit: 1 });
    expect(error.message).toContain("line 6, column 24, unit 1");
    expect(error.message).toContain("unclosed");
    expect(error.message).not.toBe(mismatch.message);
  });

  it("leaves out the unit when the problem sits outside every unit", () => {
    const error = expectTmxInvalid(() =>
      readTmx('<tmx version="1.4">\n<header srclang="en">\n</tmx>'),
    );

    expect(error.location).toEqual({ line: expect.any(Number), column: expect.any(Number) });
    expect(error.location).not.toHaveProperty("unit");
    expect(error.message).toMatch(/line \d+, column \d+: /);
  });

  it("does not let a removed multi-line doctype shift the line it reports", () => {
    const text = withLine(8, '    <tuv xml:lang="en"><seg>bbbbbb</tuv>').replace(
      '<tmx version="1.4">',
      '<!DOCTYPE tmx\n  SYSTEM "tmx14.dtd">\n<tmx version="1.4">',
    );

    expect(expectTmxInvalid(() => readTmx(text)).location).toEqual({
      line: 11,
      column: 29,
      unit: 2,
    });
  });

  it("does not let a doctype on the root element's line shift the column it reports", () => {
    const broken = withLine(1, '<tmx version="1.4"><tu><tuv xml:lang="en"><seg>x</tuv>');
    const doctype = '<!DOCTYPE tmx SYSTEM "t.dtd">';
    const withDoctype = broken.replace("<tmx ", `${doctype}<tmx `);
    const padded = broken.replace("<tmx ", `${" ".repeat(doctype.length)}<tmx `);

    const located = expectTmxInvalid(() => readTmx(withDoctype)).location;

    expect(located).toEqual(expectTmxInvalid(() => readTmx(padded)).location);
    expect(located).not.toEqual(expectTmxInvalid(() => readTmx(broken)).location);
  });

  it("locates a segment past the length limit by its unit", () => {
    const error = expectTmxInvalid(() =>
      readTmx(LINES.join("\n"), { limits: { ...DEFAULT_TMX_LIMITS, maxSegmentLength: 4 } }),
    );

    expect(error.location).toEqual({ line: 9, column: 24, unit: 2 });
    expect(error.message).toContain("line 9, column 24, unit 2");
    expect(error.message).toContain("longer than the maximum of 4");
  });

  it("locates a segment carrying a character XML 1.0 forbids by its unit", () => {
    const error = expectTmxInvalid(() =>
      readTmx(withLine(8, `    <tuv xml:lang="en"><seg>b${String.fromCharCode(7)}b</seg></tuv>`)),
    );

    expect(error.location).toEqual({ line: 9, column: 24, unit: 2 });
    expect(error.message).toContain("unit 2");
  });

  it("locates the unit that crossed the language limit", () => {
    const error = expectTmxInvalid(() =>
      readTmx(
        withLine(
          8,
          '    <tuv xml:lang="en"><seg>b</seg></tuv><tuv xml:lang="de"><seg>c</seg></tuv>',
        ),
        { limits: { ...DEFAULT_TMX_LIMITS, maxLanguagesPerUnit: 1 } },
      ),
    );

    expect(error.location).toEqual({ line: 9, column: 42, unit: 2 });
  });

  it("locates the unit that crossed the unit limit", () => {
    const error = expectTmxInvalid(() =>
      readTmx(LINES.join("\n"), { limits: { ...DEFAULT_TMX_LIMITS, maxUnitCount: 1 } }),
    );

    expect(error.location).toEqual({ line: 8, column: 3, unit: 2 });
    expect(error.message).toContain("line 8, column 3, unit 2");
  });

  it("caps the length of what the parser reports", () => {
    const name = `t${"x".repeat(400)}`;
    const error = expectTmxInvalid(() => readTmx(`<tmx version="1.4"><${name}></tmx>`));

    expect(error.message.length).toBeLessThan(400);
    expect(error.message).toContain("...");
  });

  it("neutralizes a control character the parser echoes back from the file", () => {
    const escapeCharacter = String.fromCharCode(27);
    const error = expectTmxInvalid(() =>
      readTmx(`<tmx version="1.4"><seg>a</seg${escapeCharacter}></tmx>`),
    );

    expect(error.message).not.toContain(escapeCharacter);
    expect(error.message).toContain('"seg "');
  });

  it("carries no location on a refusal that has no place in the file", () => {
    const error = expectTmxInvalid(() =>
      readTmx(tmx(unit([["en", "a"]])), { limits: { ...DEFAULT_TMX_LIMITS, maxInputBytes: 16 } }),
    );

    expect(error.location).toBeUndefined();
    expect(error.message).not.toContain("line");
  });
});
