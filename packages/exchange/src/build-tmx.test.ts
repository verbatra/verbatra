import { describe, expect, it } from "vitest";
import { buildTmx } from "./build-tmx.js";

function headerAttributes(text: string): Record<string, string> {
  const header = /<header([^>]*)\/>/.exec(text)?.[1] ?? "";
  return Object.fromEntries(
    [...header.matchAll(/([\w-]+)="([^"]*)"/g)].map((match) => [match[1] ?? "", match[2] ?? ""]),
  );
}

function segments(text: string): string[] {
  return [...text.matchAll(/<seg>([\s\S]*?)<\/seg>/g)].map((match) => match[1] ?? "");
}

describe("buildTmx writes a well-formed TMX document", () => {
  const document = buildTmx({
    sourceLanguage: "en",
    toolVersion: "9.9.9",
    units: [{ source: "Hello", translations: [{ language: "de", text: "Hallo" }] }],
  });

  it("declares the XML version and encoding", () => {
    expect(document.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
  });

  it("declares TMX 1.4", () => {
    expect(document).toContain('<tmx version="1.4">');
  });

  it("carries the header attributes a TMX consumer requires", () => {
    expect(headerAttributes(document)).toEqual({
      creationtool: "verbatra",
      creationtoolversion: "9.9.9",
      segtype: "block",
      "o-tmf": "verbatra",
      adminlang: "en",
      srclang: "en",
      datatype: "plaintext",
    });
  });

  it("reports an unknown tool version as the string TMX reserves for it", () => {
    expect(
      headerAttributes(buildTmx({ sourceLanguage: "en", units: [] })).creationtoolversion,
    ).toBe("unknown");
  });

  it("writes the source segment first, then one tuv per translation", () => {
    expect(document).toContain(
      '<tu>\n      <tuv xml:lang="en"><seg>Hello</seg></tuv>\n      <tuv xml:lang="de"><seg>Hallo</seg></tuv>\n    </tu>',
    );
  });

  it("writes a valid empty document for an empty memory", () => {
    const empty = buildTmx({ sourceLanguage: "en", units: [] });

    expect(empty).toContain("<body>\n  </body>");
    expect(empty).not.toContain("<tu>");
  });
});

describe("buildTmx escapes segment text", () => {
  function segmentFor(text: string): string {
    return (
      segments(
        buildTmx({ sourceLanguage: "en", units: [{ source: text, translations: [] }] }),
      )[0] ?? ""
    );
  }

  it("escapes the ampersand before anything else, so no escape is double-escaped", () => {
    expect(segmentFor("Tom & Jerry")).toBe("Tom &amp; Jerry");
    expect(segmentFor("&amp;")).toBe("&amp;amp;");
  });

  it("escapes both angle brackets so markup in a value is data, not structure", () => {
    expect(segmentFor("<b>bold</b>")).toBe("&lt;b&gt;bold&lt;/b&gt;");
  });

  it("writes a carriage return as a character reference so parsing cannot normalize it away", () => {
    expect(segmentFor("a\r\nb")).toBe("a&#13;\nb");
  });

  it("leaves a line feed and a tab as themselves", () => {
    expect(segmentFor("a\n\tb")).toBe("a\n\tb");
  });

  it("drops a character XML 1.0 cannot represent rather than writing a broken file", () => {
    expect(segmentFor(`a${String.fromCharCode(7)}b`)).toBe("ab");
  });

  it("escapes a language tag written into an attribute", () => {
    const document = buildTmx({
      sourceLanguage: 'en" onload="x',
      units: [],
    });

    expect(document).toContain('srclang="en&quot; onload=&quot;x"');
  });
});
