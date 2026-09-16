import { describe, expect, it } from "vitest";
import { buildTmx, removedCharacterCount } from "./build-tmx.js";

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

describe("buildTmx writes language tags in BCP 47 form", () => {
  function languages(text: string): { srclang: string | undefined; tuvs: string[] } {
    return {
      srclang: headerAttributes(text).srclang,
      tuvs: [...text.matchAll(/<tuv xml:lang="([^"]*)">/g)].map((match) => match[1] ?? ""),
    };
  }

  it("folds an underscore to a hyphen in srclang and in every xml:lang", () => {
    const text = buildTmx({
      sourceLanguage: "en_US",
      units: [{ source: "Save", translations: [{ language: "pt_BR", text: "Salvar" }] }],
    });

    expect(languages(text)).toEqual({ srclang: "en-US", tuvs: ["en-US", "pt-BR"] });
  });

  it("writes the language lowercase, a script in title case and a region uppercase", () => {
    const text = buildTmx({
      sourceLanguage: "EN",
      units: [
        {
          source: "Save",
          translations: [
            { language: "zh_hant_tw", text: "儲存" },
            { language: "SR-LATN", text: "Sačuvaj" },
            { language: "es-419", text: "Guardar" },
          ],
        },
      ],
    });

    expect(languages(text)).toEqual({
      srclang: "en",
      tuvs: ["en", "zh-Hant-TW", "sr-Latn", "es-419"],
    });
  });

  it("lowercases everything after an extension or private-use singleton", () => {
    const text = buildTmx({
      sourceLanguage: "de_de_U_CO_PHONEBK",
      units: [],
    });

    expect(headerAttributes(text).srclang).toBe("de-DE-u-co-phonebk");
    expect(headerAttributes(buildTmx({ sourceLanguage: "en-x-AB-Test", units: [] })).srclang).toBe(
      "en-x-ab-test",
    );
  });

  it("leaves adminlang as the BCP 47 tag it already is", () => {
    expect(headerAttributes(buildTmx({ sourceLanguage: "en_US", units: [] })).adminlang).toBe("en");
  });
});

describe("removedCharacterCount counts what buildTmx has to leave out", () => {
  const bell = String.fromCharCode(7);
  const loneSurrogate = String.fromCharCode(0xd800);
  const planeNoncharacter = String.fromCharCode(0xd83f, 0xdffe);

  it("counts each character XML 1.0 cannot represent across every segment", () => {
    expect(
      removedCharacterCount({
        sourceLanguage: "en",
        units: [
          {
            source: `a${bell}b${bell}`,
            translations: [{ language: "de", text: `${loneSurrogate}x${planeNoncharacter}` }],
          },
          { source: "clean", translations: [{ language: "de", text: `y${bell}` }] },
        ],
      }),
    ).toBe(5);
  });

  it("matches exactly the characters buildTmx drops", () => {
    const input = {
      sourceLanguage: "en",
      units: [
        { source: `a${bell}b`, translations: [{ language: "de", text: `c${planeNoncharacter}` }] },
      ],
    };

    expect(removedCharacterCount(input)).toBe(2);
    expect(buildTmx(input)).toContain("<seg>ab</seg>");
    expect(buildTmx(input)).toContain("<seg>c</seg>");
  });

  it("counts nothing for clean text, a tab, a line feed or a carriage return", () => {
    expect(
      removedCharacterCount({
        sourceLanguage: "en",
        units: [{ source: "a\tb\nc\rd", translations: [{ language: "de", text: "🎉" }] }],
      }),
    ).toBe(0);
  });
});
