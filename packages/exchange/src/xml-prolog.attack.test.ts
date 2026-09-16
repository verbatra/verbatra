import { describe, expect, it } from "vitest";
import { ExchangeError } from "./errors.js";
import { readTmx } from "./read-tmx.js";
import { removeSpans, scanProlog } from "./xml-prolog.js";

const BOM = "﻿";

function caught(action: () => unknown): ExchangeError {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(ExchangeError);
    return error as ExchangeError;
  }
  throw new Error("expected the call to throw");
}

function document(prolog: string, segment = "payload"): string {
  return `${prolog}<tmx version="1.4"><header srclang="en"/><body><tu><tuv xml:lang="en"><seg>${segment}</seg></tuv></tu></body></tmx>`;
}

function firstSegmentText(text: string): string | undefined {
  return readTmx(text).units[0]?.segments[0]?.text;
}

describe("the prolog walker decides on the pre-root slice and never on the payload", () => {
  it("does not record a doctype that sits inside a prolog comment", () => {
    const text = document('<!-- <!DOCTYPE tmx SYSTEM "evil.dtd"> -->');

    const scan = scanProlog(text);

    expect(scan.doctypeSpans).toEqual([]);
    expect(text.slice(scan.rootStart)).toBe(document(""));
    expect(removeSpans(text, scan.doctypeSpans)).toBe(text);
  });

  it("reads a document whose prolog comment merely mentions a doctype", () => {
    expect(firstSegmentText(document('<!-- <!DOCTYPE tmx SYSTEM "evil.dtd"> -->'))).toBe("payload");
  });

  it("ends a doctype at the first unquoted angle bracket, so a comment inside one is consumed", () => {
    const text = document('<!DOCTYPE tmx SYSTEM "a.dtd" <!-- note -->');

    const scan = scanProlog(text);

    expect(scan.doctypeSpans).toEqual([[0, text.indexOf("<tmx")]]);
    expect(removeSpans(text, scan.doctypeSpans)).toBe(document(""));
  });

  it("refuses rather than half-cutting when a comment inside a doctype closes it early", () => {
    expect(caught(() => scanProlog(document("<!DOCTYPE tmx <!-- a > b --> "))).message).toContain(
      "before the root element",
    );
  });

  it("walks past a processing instruction whose data spells a doctype, leaving it intact", () => {
    const text = document('<?tool <!DOCTYPE tmx SYSTEM "evil.dtd"> ?>');

    const scan = scanProlog(text);

    expect(scan.doctypeSpans).toEqual([]);
    expect(firstSegmentText(text)).toBe("payload");
  });

  it("still refuses an entity declaration smuggled inside a processing instruction", () => {
    expect(
      caught(() => readTmx(document('<?tool <!ENTITY x SYSTEM "file:///etc/passwd"> ?>'))).code,
    ).toBe("TMX_INVALID");
  });

  it("does not end a single-quoted system identifier at an angle bracket inside it", () => {
    const text = document("<!DOCTYPE tmx SYSTEM 'a>b\"c.dtd'>");

    expect(removeSpans(text, scanProlog(text).doctypeSpans)).toBe(document(""));
    expect(firstSegmentText(text)).toBe("payload");
  });

  it("leaves a doctype that follows the root element in place, for the parser to refuse", () => {
    const text = '<tmx version="1.4"><!DOCTYPE tmx><body/></tmx>';

    expect(scanProlog(text)).toEqual({ rootStart: 0, doctypeSpans: [] });
    expect(caught(() => readTmx(text)).message).toContain("not valid XML");
  });

  it("removes only the prolog doctype and keeps a doctype-shaped payload byte for byte", () => {
    const payload = '<![CDATA[<!DOCTYPE evil SYSTEM "x.dtd">]]>';
    const text = document('<!DOCTYPE tmx SYSTEM "real.dtd">', payload);

    const scan = scanProlog(text);

    expect(scan.doctypeSpans).toHaveLength(1);
    expect(removeSpans(text, scan.doctypeSpans)).toContain(payload);
    expect(firstSegmentText(text)).toBe('<!DOCTYPE evil SYSTEM "x.dtd">');
  });

  it("refuses a nested comment rather than letting its tail reach the parser", () => {
    expect(caught(() => scanProlog(document("<!-- outer <!-- inner --> -->"))).message).toContain(
      "before the root element",
    );
  });

  it("refuses an unterminated comment even when a root element follows it", () => {
    expect(caught(() => scanProlog(document("<!-- never closed"))).message).toContain("-->");
    expect(caught(() => readTmx(document("<!-- never closed"))).code).toBe("TMX_INVALID");
  });

  it("walks a byte order mark, a declaration, a comment and a doctype in sequence", () => {
    const text = `${BOM}<?xml version="1.0" encoding="UTF-8"?>\n<!-- exported by a tool -->\n<!DOCTYPE tmx SYSTEM "tmx14.dtd">\n${document("")}`;

    expect(firstSegmentText(text)).toBe("payload");
    expect(readTmx(text).sourceLanguage).toBe("en");
  });

  it("refuses a byte order mark that is not the very first character of the file", () => {
    const text = `<?xml version="1.0"?>${BOM}<!DOCTYPE tmx SYSTEM "t.dtd">${document("")}`;

    expect(removeSpans(text, scanProlog(text).doctypeSpans)).toBe(
      `<?xml version="1.0"?>${BOM}${document("")}`,
    );
    expect(caught(() => readTmx(text)).message).toContain("not valid XML");
  });

  it("reports the doctype spans in ascending order, so removal never shifts a later one", () => {
    const text = document('<!DOCTYPE a SYSTEM "a.dtd"><!-- gap --><!DOCTYPE b SYSTEM "b.dtd">');

    const spans = scanProlog(text).doctypeSpans;

    expect(spans.map(([start, end]) => text.slice(start, end))).toEqual([
      '<!DOCTYPE a SYSTEM "a.dtd">',
      '<!DOCTYPE b SYSTEM "b.dtd">',
    ]);
    expect(removeSpans(text, spans)).toBe(document("<!-- gap -->"));
  });
});

describe("the raw entity scan runs on the pre-root slice only", () => {
  it("refuses an entity declaration hidden in the prolog and keeps one in the payload", () => {
    expect(caught(() => readTmx(document('<!-- <!ENTITY x "y"> -->'))).message).toContain("entity");
    expect(firstSegmentText(document("", '<![CDATA[<!ENTITY x "y">]]>'))).toBe('<!ENTITY x "y">');
  });

  it("over-refuses a doctype whose system identifier merely quotes the word, which is safe but blunt", () => {
    expect(caught(() => readTmx(document("<!DOCTYPE tmx SYSTEM '<!ENTITY'>"))).message).toContain(
      "entity",
    );
  });
});
