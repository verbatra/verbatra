import { describe, expect, it } from "vitest";
import { AdapterError } from "../errors.js";
import { detectLineTerminator, parsePoEntries, scanPo, splitPhysicalLines } from "./parse.js";

const EN_HEADER = [
  'msgid ""',
  'msgstr ""',
  '"Content-Type: text/plain; charset=UTF-8\\n"',
  '"Plural-Forms: nplurals=2; plural=(n != 1);\\n"',
  "",
].join("\n");

const JA_HEADER = [
  'msgid ""',
  'msgstr ""',
  '"Content-Type: text/plain; charset=UTF-8\\n"',
  '"Plural-Forms: nplurals=1; plural=0;\\n"',
  "",
].join("\n");

const PL_HEADER = [
  'msgid ""',
  'msgstr ""',
  '"Content-Type: text/plain; charset=UTF-8\\n"',
  '"Plural-Forms: nplurals=3; plural=(n==1 ? 0 : n%10>=2 && n%10<=4 && (n%100<10 || n%100>=20) ? 1 : 2);\\n"',
  "",
].join("\n");

describe("parsePoEntries: singular entries", () => {
  it("parses a plain msgid/msgstr pair", () => {
    const content = `${EN_HEADER}msgid "Hello"\nmsgstr "Hallo"\n`;
    const entries = parsePoEntries(content, "messages");
    expect(entries.get("Hello")).toMatchObject({ value: "Hallo", isPlural: false });
  });

  it('does not surface the header entry (msgid "") as a translatable entry', () => {
    const content = `${EN_HEADER}msgid "Hi"\nmsgstr "Hallo"\n`;
    const entries = parsePoEntries(content, "messages");
    expect(entries.has("")).toBe(false);
    expect(entries.size).toBe(1);
  });

  it("reads a .pot template with an empty msgstr", () => {
    const content = `${EN_HEADER}msgid "Hi"\nmsgstr ""\n`;
    const entries = parsePoEntries(content, "messages");
    expect(entries.get("Hi")).toMatchObject({ value: "" });
  });

  it("decodes C-string escapes and multi-line concatenation", () => {
    const content = `${EN_HEADER}msgid "line one\\n"\n"line two"\nmsgstr "eins\\n"\n"zwei"\n`;
    const entries = parsePoEntries(content, "messages");
    expect(entries.get("line one\nline two")).toMatchObject({ value: "eins\nzwei" });
  });

  it("extracts a #. developer comment into description", () => {
    const content = `${EN_HEADER}#. shown on the login button\nmsgid "Log in"\nmsgstr "Anmelden"\n`;
    const entries = parsePoEntries(content, "messages");
    expect(entries.get("Log in")?.description).toBe("shown on the login button");
  });

  it("preserves a #~ obsolete block as raw text, never as an entry", () => {
    const content = `${EN_HEADER}#~ msgid "Old"\n#~ msgstr "Alt"\n\nmsgid "New"\nmsgstr "Neu"\n`;
    const entries = parsePoEntries(content, "messages");
    expect(entries.has("Old")).toBe(false);
    expect(entries.get("New")).toMatchObject({ value: "Neu" });
  });

  it("reads an existing translation on a fuzzy entry as a normal value", () => {
    const content = `${EN_HEADER}#, fuzzy\nmsgid "Save"\nmsgstr "Speichern (alt)"\n`;
    const entries = parsePoEntries(content, "messages");
    expect(entries.get("Save")).toMatchObject({ value: "Speichern (alt)" });
  });

  it("preserves #: reference and #| previous-msgid comment lines without special handling", () => {
    const content = `${EN_HEADER}#: src/app.ts:42\n#| msgid "Sav"\nmsgid "Save"\nmsgstr "Speichern"\n`;
    const entries = parsePoEntries(content, "messages");
    expect(entries.get("Save")).toMatchObject({ value: "Speichern" });
  });
});

describe("parsePoEntries: msgctxt disambiguation", () => {
  it("keeps two entries sharing one msgid but different msgctxt distinct", () => {
    const content = `${EN_HEADER}msgctxt "menu"\nmsgid "Open"\nmsgstr "Oeffnen"\n\nmsgctxt "dialog"\nmsgid "Open"\nmsgstr "Offen"\n`;
    const entries = parsePoEntries(content, "messages");
    expect(entries.size).toBe(2);
    const values = [...entries.values()].map((e) => e.value).sort();
    expect(values).toEqual(["Oeffnen", "Offen"]);
  });
});

describe("parsePoEntries: plural forms across languages with different nplurals", () => {
  it("English: two forms, msgstr[0] and msgstr[1]", () => {
    const content = `${EN_HEADER}msgid "one item"\nmsgid_plural "%d items"\nmsgstr[0] "one item"\nmsgstr[1] "%d items"\n`;
    const entries = parsePoEntries(content, "messages");
    expect(entries.get("one item[0]")).toMatchObject({
      value: "one item",
      isPlural: true,
      meaning: "%d items",
    });
    expect(entries.get("one item[1]")).toMatchObject({ value: "%d items", isPlural: true });
  });

  it("Japanese: a single form, msgstr[0] only", () => {
    const content = `${JA_HEADER}msgid "one item"\nmsgid_plural "%d items"\nmsgstr[0] "%d items"\n`;
    const entries = parsePoEntries(content, "messages");
    expect(entries.size).toBe(1);
    expect(entries.get("one item[0]")).toMatchObject({ value: "%d items" });
  });

  it("Polish: three forms, msgstr[0..2]", () => {
    const content = `${PL_HEADER}msgid "one item"\nmsgid_plural "%d items"\nmsgstr[0] "jeden"\nmsgstr[1] "dwa"\nmsgstr[2] "wiele"\n`;
    const entries = parsePoEntries(content, "messages");
    expect(entries.size).toBe(3);
    expect(entries.get("one item[0]")).toMatchObject({ value: "jeden" });
    expect(entries.get("one item[1]")).toMatchObject({ value: "dwa" });
    expect(entries.get("one item[2]")).toMatchObject({ value: "wiele" });
  });

  it("carries the msgid_plural text on every index via meaning, for from-scratch resynthesis", () => {
    const content = `${PL_HEADER}msgid "one item"\nmsgid_plural "%d items"\nmsgstr[0] "jeden"\nmsgstr[1] "dwa"\nmsgstr[2] "wiele"\n`;
    const entries = parsePoEntries(content, "messages");
    for (const entry of entries.values()) {
      expect(entry.meaning).toBe("%d items");
    }
  });

  it("combines msgctxt with a plural base key", () => {
    const content = `${EN_HEADER}msgctxt "cart"\nmsgid "one item"\nmsgid_plural "%d items"\nmsgstr[0] "one"\nmsgstr[1] "many"\n`;
    const entries = parsePoEntries(content, "messages");
    expect(entries.size).toBe(2);
  });
});

describe("parsePoEntries: malformed input yields a structured AdapterError", () => {
  it("rejects a plural entry with no Plural-Forms header", () => {
    const content = 'msgid "one"\nmsgid_plural "many"\nmsgstr[0] "one"\nmsgstr[1] "many"\n';
    expect(() => parsePoEntries(content, "messages")).toThrow(AdapterError);
    expect(() => parsePoEntries(content, "messages")).toThrow(/no "Plural-Forms" header/);
  });

  it("rejects a msgstr[n] index at or beyond the header's nplurals bound", () => {
    const content = `${EN_HEADER}msgid "one"\nmsgid_plural "many"\nmsgstr[0] "one"\nmsgstr[1] "many"\nmsgstr[2] "too many"\n`;
    expect(() => parsePoEntries(content, "messages")).toThrow(/nplurals=2/);
  });

  it("rejects a non-contiguous msgstr index", () => {
    const content = `${EN_HEADER}msgid "one"\nmsgid_plural "many"\nmsgstr[0] "one"\nmsgstr[2] "many"\n`;
    expect(() => parsePoEntries(content, "messages")).toThrow(/non-contiguous/);
  });

  it("rejects an entry missing msgstr entirely", () => {
    const content = `${EN_HEADER}msgid "Hi"\n`;
    expect(() => parsePoEntries(content, "messages")).toThrow(/expected "msgstr"/);
  });

  it("rejects an unterminated quoted string, naming the line", () => {
    const content = `${EN_HEADER}msgid "Hi\nmsgstr "Hallo"\n`;
    try {
      parsePoEntries(content, "messages");
      throw new Error("expected a throw");
    } catch (error) {
      expect(error).toBeInstanceOf(AdapterError);
      expect((error as AdapterError).message).toMatch(/line \d+/);
    }
  });

  it("rejects garbage where a msgid or comment was expected", () => {
    const content = `${EN_HEADER}not a valid line\n`;
    expect(() => parsePoEntries(content, "messages")).toThrow(/expected "msgid"/);
  });
});

describe("detectLineTerminator and splitPhysicalLines", () => {
  it("detects CRLF", () => {
    expect(detectLineTerminator("a\r\nb\r\n")).toBe("\r\n");
  });

  it("detects a lone CR", () => {
    expect(detectLineTerminator("a\rb\r")).toBe("\r");
  });

  it("defaults to LF", () => {
    expect(detectLineTerminator("a\nb\n")).toBe("\n");
  });

  it("returns no lines for empty content", () => {
    expect(splitPhysicalLines("")).toEqual([]);
  });

  it("keeps the final line when content does not end with a terminator", () => {
    expect(splitPhysicalLines("a\nb")).toEqual(["a", "b"]);
  });
});

describe("parsePoEntries: additional grammar edge cases", () => {
  it("accepts a #. comment with no space after the marker", () => {
    const content = `${EN_HEADER}#.no-space-comment\nmsgid "Hi"\nmsgstr "Hallo"\n`;
    const entries = parsePoEntries(content, "messages");
    expect(entries.get("Hi")?.description).toBe("no-space-comment");
  });

  it("rejects trailing content after a closing quote on the same line", () => {
    const content = `${EN_HEADER}msgid "Hi" extra\nmsgstr "Hallo"\n`;
    expect(() => parsePoEntries(content, "messages")).toThrow(/unexpected content/);
  });

  it("rejects a quoted string ending in a lone trailing backslash with no closing quote", () => {
    const content = `${EN_HEADER}msgid "Hi\\\nmsgstr "Hallo"\n`;
    expect(() => parsePoEntries(content, "messages")).toThrow(/unterminated escape/);
  });

  it("rejects a plural msgid_plural entry with no indexed msgstr lines at all", () => {
    const content = `${EN_HEADER}msgid "one"\nmsgid_plural "many"\nmsgstr "not indexed"\n`;
    expect(() => parsePoEntries(content, "messages")).toThrow(/missing msgstr\[n\] forms/);
  });

  it("rejects a file that ends right after a comment block with no entry following it", () => {
    const content = `${EN_HEADER}# a translator comment with nothing after it\n`;
    expect(() => parsePoEntries(content, "messages")).toThrow(/no entry following/);
  });

  it("rejects a file that ends right after msgctxt with no msgid following", () => {
    const content = `${EN_HEADER}msgctxt "menu"\n`;
    expect(() => parsePoEntries(content, "messages")).toThrow(/expected "msgid"/);
  });

  it("rejects a file that ends right after msgid_plural with no msgstr[n] lines at all", () => {
    const content = `${EN_HEADER}msgid "one"\nmsgid_plural "many"\n`;
    expect(() => parsePoEntries(content, "messages")).toThrow(/missing msgstr\[n\] forms/);
  });
});

describe("scanPo: header extraction", () => {
  it("extracts Plural-Forms from the header block into headerFields", () => {
    const doc = scanPo(EN_HEADER);
    expect(doc.headerFields?.get("Plural-Forms")).toBe("nplurals=2; plural=(n != 1);");
  });

  it("returns undefined headerFields for a file with no header entry", () => {
    const doc = scanPo('msgid "Hi"\nmsgstr "Hallo"\n');
    expect(doc.headerFields).toBeUndefined();
  });

  it("represents the header as a single raw pass-through node", () => {
    const doc = scanPo(EN_HEADER);
    expect(doc.nodes).toHaveLength(1);
    expect(doc.nodes[0]?.kind).toBe("raw");
  });
});
