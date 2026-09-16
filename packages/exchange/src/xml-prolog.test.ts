import { describe, expect, it } from "vitest";
import { ExchangeError } from "./errors.js";
import { removeSpans, scanProlog } from "./xml-prolog.js";

function expectInvalid(action: () => unknown): ExchangeError {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(ExchangeError);
    return error as ExchangeError;
  }
  throw new Error("expected the scan to throw");
}

describe("scanProlog finds where the root element starts", () => {
  it("reports position zero when the document opens with its root", () => {
    expect(scanProlog("<tmx/>")).toEqual({ rootStart: 0, doctypeSpans: [] });
  });

  it("walks past a declaration, comments and a doctype", () => {
    const text = '<?xml version="1.0"?>\n<!-- note -->\n<!DOCTYPE tmx SYSTEM "t.dtd">\n<tmx/>';

    const scan = scanProlog(text);

    expect(text.slice(scan.rootStart)).toBe("<tmx/>");
    expect(scan.doctypeSpans).toEqual([[36, 65]]);
    expect(text.slice(36, 65)).toBe('<!DOCTYPE tmx SYSTEM "t.dtd">');
  });

  it("records every doctype, not only the first", () => {
    const text = '<!DOCTYPE tmx SYSTEM "a.dtd"><!DOCTYPE tmx SYSTEM "b.dtd"><tmx/>';

    expect(scanProlog(text).doctypeSpans).toHaveLength(2);
  });

  it("does not end a doctype at a greater-than inside its system identifier", () => {
    const text = '<!DOCTYPE tmx SYSTEM "a>b.dtd"><tmx/>';

    const scan = scanProlog(text);

    expect(text.slice(scan.rootStart)).toBe("<tmx/>");
  });

  it("refuses an internal subset", () => {
    expect(
      expectInvalid(() => scanProlog("<!DOCTYPE tmx [<!ELEMENT x EMPTY>]><tmx/>")).message,
    ).toContain("internal DTD subset");
  });

  it("refuses a markup declaration that is not a doctype", () => {
    expect(expectInvalid(() => scanProlog('<!ENTITY x "y"><tmx/>')).message).toContain("entity");
  });

  it("refuses an unclosed doctype, comment, declaration and stray text", () => {
    expect(expectInvalid(() => scanProlog("<!DOCTYPE tmx")).message).toContain("never closed");
    expect(expectInvalid(() => scanProlog("<!-- open")).message).toContain("-->");
    expect(expectInvalid(() => scanProlog("<?xml")).message).toContain("?>");
    expect(expectInvalid(() => scanProlog("text<tmx/>")).message).toContain("before the root");
    expect(expectInvalid(() => scanProlog("<!-- only -->")).message).toContain("no root element");
  });

  it("stops at the root element, so nothing inside the document is in the prolog", () => {
    const text = "<tmx><body><tu><seg><![CDATA[<!DOCTYPE evil>]]></seg></tu></body></tmx>";

    expect(scanProlog(text)).toEqual({ rootStart: 0, doctypeSpans: [] });
  });
});

describe("removeSpans cuts exactly the recorded regions", () => {
  it("removes one span and leaves the rest byte for byte", () => {
    expect(removeSpans("abcdefg", [[2, 5]])).toBe("abfg");
  });

  it("removes several spans without the earlier cut shifting the later one", () => {
    expect(
      removeSpans("0123456789", [
        [1, 3],
        [6, 8],
      ]),
    ).toBe("034589");
  });

  it("returns the text unchanged when there is nothing to remove", () => {
    expect(removeSpans("unchanged", [])).toBe("unchanged");
  });

  it("removes exactly the doctype scanProlog found, and nothing else", () => {
    const text = '<?xml version="1.0"?><!DOCTYPE tmx SYSTEM "t.dtd"><tmx>body</tmx>';

    expect(removeSpans(text, scanProlog(text).doctypeSpans)).toBe(
      '<?xml version="1.0"?><tmx>body</tmx>',
    );
  });
});
