import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { LocaleResource, SupportedFormat, TranslationEntry } from "@verbatra/core";
import { describe, expect, it } from "vitest";
import type { FormatAdapter } from "../adapter.js";
import { createDefaultRegistry } from "../default-registry.js";
import { AdapterError } from "../errors.js";
import { MAX_INPUT_BYTES } from "../json/limits.js";
import { createAppleStringsAdapter } from "./apple-strings-adapter.js";

const adapter = createAppleStringsAdapter();

async function tempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "verbatra-apple-strings-"));
}

async function tempFile(name: string, content: string): Promise<string> {
  const path = join(await tempDir(), name);
  await writeFile(path, content, "utf8");
  return path;
}

async function tempBinaryFile(name: string, content: Uint8Array): Promise<string> {
  const path = join(await tempDir(), name);
  await writeFile(path, content);
  return path;
}

async function readError(promise: Promise<unknown>): Promise<unknown> {
  return promise.catch((error: unknown) => error);
}

function resolveViaRegistry(path: string, format?: SupportedFormat): FormatAdapter {
  const resolution = createDefaultRegistry().resolve(
    path,
    format === undefined ? undefined : { format },
  );
  if (resolution.status !== "resolved") {
    throw new Error(`expected resolved, got ${resolution.status}`);
  }
  return resolution.adapter;
}

function makeResource(entries: Map<string, TranslationEntry>): LocaleResource {
  return { locale: "de", namespace: "Localizable", format: "apple-strings", entries };
}

function entry(key: string, value: string, description?: string): TranslationEntry {
  return {
    key,
    namespace: "Localizable",
    value,
    placeholders: [],
    isPlural: false,
    ...(description !== undefined ? { description } : {}),
  };
}

function utf16leWithBom(text: string): Buffer {
  return Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, "utf16le")]);
}

function utf16beWithBom(text: string): Buffer {
  const le = Buffer.from(text, "utf16le");
  const be = Buffer.alloc(le.length);
  for (let i = 0; i < le.length; i += 2) {
    be[i] = le[i + 1] as number;
    be[i + 1] = le[i] as number;
  }
  return Buffer.concat([Buffer.from([0xfe, 0xff]), be]);
}

describe("createAppleStringsAdapter detection", () => {
  it("handles .strings by extension only", () => {
    expect(adapter.canHandle("Localizable.strings")).toBe(true);
    expect(adapter.canHandle("Localizable.json")).toBe(false);
  });

  it("reports format apple-strings", () => {
    expect(adapter.format).toBe("apple-strings");
  });

  it("resolves through the default registry by extension detection", () => {
    expect(resolveViaRegistry("Localizable.strings").format).toBe("apple-strings");
  });

  it("resolves through the default registry by explicit format", () => {
    expect(resolveViaRegistry("anything", "apple-strings").format).toBe("apple-strings");
  });
});

describe("createAppleStringsAdapter read", () => {
  it("returns one entry per statement with the value decoded", async () => {
    const path = await tempFile("m.strings", '"greeting" = "Hello";\n"name" = "World";\n');
    const { resource } = await adapter.read(path, "de");
    expect([...resource.entries.keys()]).toEqual(["greeting", "name"]);
    expect(resource.entries.get("greeting")?.value).toBe("Hello");
    expect(resource.entries.get("name")?.value).toBe("World");
  });

  it("decodes the standard escapes and a \\U unicode escape", async () => {
    const path = await tempFile("m.strings", `${String.raw`"k" = "a\"b\\c\nd\te caf\U00e9";`}\n`);
    const { resource } = await adapter.read(path, "de");
    expect(resource.entries.get("k")?.value).toBe('a"b\\c\nd\te café');
  });

  it("surfaces a leading block comment as the entry's description", async () => {
    const path = await tempFile(
      "m.strings",
      '/* Shown on the welcome screen */\n"greeting" = "Hello";\n"name" = "World";\n',
    );
    const { resource } = await adapter.read(path, "de");
    expect(resource.entries.get("greeting")?.description).toBe("Shown on the welcome screen");
    expect(resource.entries.get("name")?.description).toBeUndefined();
  });

  it("only attaches the comment immediately preceding an entry, not an earlier one", async () => {
    const path = await tempFile(
      "m.strings",
      '/* file header */\n\n/* greeting comment */\n"greeting" = "Hello";\n',
    );
    const { resource } = await adapter.read(path, "de");
    expect(resource.entries.get("greeting")?.description).toBe("greeting comment");
  });

  it("does not attach a comment separated from the entry by a blank line", async () => {
    const path = await tempFile("m.strings", '/* File header */\n\n"a" = "1";\n"b" = "2";\n');
    const { resource } = await adapter.read(path, "de");
    expect(resource.entries.get("a")?.description).toBeUndefined();
  });

  it("keeps a blank-line-separated header comment when the entry after it is dropped", async () => {
    const path = await tempFile("m.strings", '/* File header */\n\n"a" = "1";\n"b" = "2";\n');
    const { resource } = await adapter.read(path, "de");
    const entries = new Map(resource.entries);
    entries.delete("a");
    await adapter.write({ ...resource, entries }, path);
    const written = await readFile(path, "utf8");
    expect(written).toContain("/* File header */");
    expect(written).toBe('/* File header */\n"b" = "2";\n');
  });

  it("skips a single-line comment without treating it as a description", async () => {
    const path = await tempFile("m.strings", '// internal note\n"greeting" = "Hello";\n');
    const { resource } = await adapter.read(path, "de");
    expect(resource.entries.get("greeting")?.description).toBeUndefined();
    expect(resource.entries.get("greeting")?.value).toBe("Hello");
  });

  it("populates printf placeholders from the value", async () => {
    const path = await tempFile("m.strings", '"hi" = "Hello %@, you have %d items";\n');
    const { resource } = await adapter.read(path, "de");
    expect(resource.entries.get("hi")?.placeholders).toEqual(["%@", "%d"]);
  });

  it("keeps the last value and first position for a duplicate key", async () => {
    const path = await tempFile("m.strings", '"k" = "first";\n"other" = "x";\n"k" = "second";\n');
    const { resource } = await adapter.read(path, "de");
    expect([...resource.entries.keys()]).toEqual(["k", "other"]);
    expect(resource.entries.get("k")?.value).toBe("second");
  });

  it("returns no entries for an empty file", async () => {
    const { resource } = await adapter.read(await tempFile("m.strings", ""), "de");
    expect(resource.entries.size).toBe(0);
  });

  it("rejects an unterminated quoted string as a structured AdapterError", async () => {
    const error = await readError(
      adapter.read(await tempFile("bad.strings", '"greeting" = "Hello'), "de"),
    );
    expect(error).toBeInstanceOf(AdapterError);
    expect((error as AdapterError).code).toBe("INVALID_STRUCTURE");
  });

  it("rejects a statement missing its ; terminator as a structured AdapterError", async () => {
    const error = await readError(
      adapter.read(await tempFile("bad.strings", '"greeting" = "Hello"'), "de"),
    );
    expect((error as AdapterError).code).toBe("INVALID_STRUCTURE");
  });

  it("rejects a statement missing its = separator as a structured AdapterError", async () => {
    const error = await readError(
      adapter.read(await tempFile("bad.strings", '"greeting" "Hello";\n'), "de"),
    );
    expect((error as AdapterError).code).toBe("INVALID_STRUCTURE");
  });

  it("rejects a statement whose value is not a quoted string as a structured AdapterError", async () => {
    const error = await readError(
      adapter.read(await tempFile("bad.strings", '"greeting" = Hello;\n'), "de"),
    );
    expect((error as AdapterError).code).toBe("INVALID_STRUCTURE");
  });

  it("does not attach a description when a line comment follows the block comment before the entry", async () => {
    const path = await tempFile(
      "m.strings",
      '/* not attached */\n// a stray note\n"greeting" = "Hello";\n',
    );
    const { resource } = await adapter.read(path, "de");
    expect(resource.entries.get("greeting")?.description).toBeUndefined();
  });

  it("rejects an unknown escape sequence as a structured AdapterError", async () => {
    const error = await readError(
      adapter.read(await tempFile("bad.strings", `${String.raw`"k" = "a\qb";`}\n`), "de"),
    );
    expect((error as AdapterError).code).toBe("INVALID_STRUCTURE");
  });

  it("rejects a malformed \\U unicode escape as a structured AdapterError", async () => {
    const error = await readError(
      adapter.read(await tempFile("bad.strings", `${String.raw`"k" = "a\U12zz";`}\n`), "de"),
    );
    expect((error as AdapterError).code).toBe("INVALID_STRUCTURE");
  });

  it("rejects a little-endian UTF-16 byte-order-mark instead of parsing corrupt keys", async () => {
    const path = await tempBinaryFile("utf16le.strings", utf16leWithBom('"greeting" = "Hello";\n'));
    const error = await readError(adapter.read(path, "de"));
    expect(error).toBeInstanceOf(AdapterError);
    expect((error as AdapterError).code).toBe("INVALID_STRUCTURE");
  });

  it("rejects a big-endian UTF-16 byte-order-mark instead of parsing corrupt keys", async () => {
    const path = await tempBinaryFile("utf16be.strings", utf16beWithBom('"greeting" = "Hello";\n'));
    const error = await readError(adapter.read(path, "de"));
    expect(error).toBeInstanceOf(AdapterError);
    expect((error as AdapterError).code).toBe("INVALID_STRUCTURE");
  });

  it("rejects oversized input with INPUT_TOO_LARGE", async () => {
    const path = await tempBinaryFile("big.strings", new Uint8Array(MAX_INPUT_BYTES + 1));
    const error = await readError(adapter.read(path, "de"));
    expect((error as AdapterError).code).toBe("INPUT_TOO_LARGE");
  });
});

describe("createAppleStringsAdapter write (round-trip fidelity)", () => {
  const canonical =
    '/* Greeting section */\n"greeting" = "Hello";\n"name" = "World";\n\n/* Farewell */\n"farewell" = "Goodbye";\n';

  it("reproduces a canonical file byte for byte when nothing changes", async () => {
    const path = await tempFile("m.strings", canonical);
    const { resource } = await adapter.read(path, "de");
    await adapter.write(resource, path);
    expect(await readFile(path, "utf8")).toBe(canonical);
  });

  it("a non-canonical CRLF file with a \\U escape round-trips with only the escape form changed", async () => {
    const nonCanonical = '/* Note */\r\n"greeting"="Caf\\U00e9";\r\n\r\n"name" = "World";\r\n';
    const path = await tempFile("m.strings", nonCanonical);
    const { resource } = await adapter.read(path, "de");
    expect([...resource.entries.keys()]).toEqual(["greeting", "name"]);
    expect(resource.entries.get("greeting")?.value).toBe("Café");
    expect(resource.entries.get("greeting")?.description).toBe("Note");
    expect(resource.entries.get("name")?.value).toBe("World");

    await adapter.write(resource, path);
    const written = await readFile(path, "utf8");
    const onlyEscapeFormChanged = nonCanonical.replace("Caf\\U00e9", "Café");
    expect(written).toBe(onlyEscapeFormChanged);
  });

  it("preserves comments, the blank line, and key order on round-trip", async () => {
    const path = await tempFile("m.strings", canonical);
    const { resource } = await adapter.read(path, "de");
    await adapter.write(resource, path);
    const written = await readFile(path, "utf8");
    expect(written).toContain("/* Greeting section */");
    expect(written).toContain("/* Farewell */");
    expect(written).toContain("\n\n");
    const reread = await adapter.read(path, "de");
    expect([...reread.resource.entries.keys()]).toEqual(["greeting", "name", "farewell"]);
    expect(reread.resource.entries.get("farewell")?.description).toBe("Farewell");
  });

  it("writes a changed value while keeping the surrounding structure and comment", async () => {
    const path = await tempFile("m.strings", canonical);
    const { resource } = await adapter.read(path, "de");
    const entries = new Map(resource.entries);
    const greeting = entries.get("greeting");
    if (greeting) {
      entries.set("greeting", { ...greeting, value: "Hallo" });
    }
    await adapter.write({ ...resource, entries }, path);
    const written = await readFile(path, "utf8");
    expect(written).toContain('"greeting" = "Hallo";');
    expect(written).toContain("/* Greeting section */");
  });

  it("does not write a translation entry's description back into the file", async () => {
    const path = await tempFile("m.strings", canonical);
    const { resource } = await adapter.read(path, "de");
    const entries = new Map(resource.entries);
    const farewell = entries.get("farewell");
    if (farewell) {
      entries.set("farewell", { ...farewell, description: "a different note" });
    }
    await adapter.write({ ...resource, entries }, path);
    const written = await readFile(path, "utf8");
    expect(written).toContain("/* Farewell */");
    expect(written).not.toContain("a different note");
  });

  it("appends a source key the destination lacks, in iteration order", async () => {
    const path = await tempFile("m.strings", '"greeting" = "Hello";\n');
    const entries = new Map([
      ["greeting", entry("greeting", "Hello")],
      ["farewell", entry("farewell", "Bye")],
    ]);
    await adapter.write(makeResource(entries), path);
    expect(await readFile(path, "utf8")).toBe('"greeting" = "Hello";\n"farewell" = "Bye";\n');
  });

  it("collapses a duplicate destination key to one line and stays stable across writes", async () => {
    const path = await tempFile("m.strings", '"k" = "first";\n"other" = "x";\n"k" = "second";\n');
    const first = await adapter.read(path, "de");
    await adapter.write(first.resource, path);
    const afterFirst = await readFile(path, "utf8");
    expect(afterFirst).toBe('"k" = "second";\n"other" = "x";\n');
    const second = await adapter.read(path, "de");
    await adapter.write(second.resource, path);
    expect(await readFile(path, "utf8")).toBe(afterFirst);
  });

  it("drops a destination key no longer present in the entries", async () => {
    const path = await tempFile("m.strings", '"keep" = "yes";\n"gone" = "no";\n');
    const entries = new Map([["keep", entry("keep", "yes")]]);
    await adapter.write(makeResource(entries), path);
    expect(await readFile(path, "utf8")).toBe('"keep" = "yes";\n');
  });

  it("drops a dropped key's own leading comment with it, leaving no dangling comment or blank line", async () => {
    const path = await tempFile(
      "m.strings",
      '"keep" = "yes";\n\n/* about to be removed */\n"gone" = "no";\n',
    );
    const entries = new Map([["keep", entry("keep", "yes")]]);
    await adapter.write(makeResource(entries), path);
    expect(await readFile(path, "utf8")).toBe('"keep" = "yes";\n');
  });

  it("synthesizes a file from entries alone when the destination does not exist", async () => {
    const path = join(await tempDir(), "absent.strings");
    const entries = new Map([["a", entry("a", "one")]]);
    await adapter.write(makeResource(entries), path);
    expect(await readFile(path, "utf8")).toBe('"a" = "one";\n');
  });

  it("writes an empty file for an empty entry set with no destination", async () => {
    const path = join(await tempDir(), "empty.strings");
    await adapter.write(makeResource(new Map()), path);
    expect(await readFile(path, "utf8")).toBe("");
  });

  it("creates a missing {locale}.lproj directory on write", async () => {
    const path = join(await tempDir(), "de.lproj", "Localizable.strings");
    const entries = new Map([["greeting", entry("greeting", "Hallo")]]);
    await adapter.write(makeResource(entries), path);
    expect(await readFile(path, "utf8")).toBe('"greeting" = "Hallo";\n');
  });

  it("escapes a quote, a backslash, and a newline in a value on write", async () => {
    const value = 'a "quote", a \\backslash and a\nnewline';
    const path = join(await tempDir(), "m.strings");
    const entries = new Map([["k", entry("k", value)]]);
    await adapter.write(makeResource(entries), path);
    const written = await readFile(path, "utf8");
    expect(written).toContain('\\"quote\\"');
    expect(written).toContain("\\\\backslash");
    expect(written).toContain("a\\nnewline");
    const { resource } = await adapter.read(path, "de");
    expect(resource.entries.get("k")?.value).toBe(value);
  });

  it("writes a non-ASCII value as raw UTF-8, not a \\U escape", async () => {
    const value = "café éè ü";
    const path = join(await tempDir(), "m.strings");
    const entries = new Map([["k", entry("k", value)]]);
    await adapter.write(makeResource(entries), path);
    const written = await readFile(path, "utf8");
    expect(written).toContain(value);
    expect(written).not.toMatch(/\\U[0-9a-fA-F]{4}/);
  });

  it("escapes a tab in a value on write", async () => {
    const path = join(await tempDir(), "m.strings");
    const entries = new Map([["k", entry("k", "a\tb")]]);
    await adapter.write(makeResource(entries), path);
    expect(await readFile(path, "utf8")).toBe('"k" = "a\\tb";\n');
  });

  it("adds a newline before an appended entry when the destination has none at the end", async () => {
    const path = await tempFile("m.strings", '"keep" = "yes";');
    const entries = new Map([
      ["keep", entry("keep", "yes")],
      ["added", entry("added", "new")],
    ]);
    await adapter.write(makeResource(entries), path);
    expect(await readFile(path, "utf8")).toBe('"keep" = "yes";\n"added" = "new";\n');
  });

  it("appends a new entry using the destination's own CRLF terminator, not LF", async () => {
    const path = await tempFile("m.strings", '"keep" = "yes";\r\n');
    const entries = new Map([
      ["keep", entry("keep", "yes")],
      ["added", entry("added", "new")],
    ]);
    await adapter.write(makeResource(entries), path);
    expect(await readFile(path, "utf8")).toBe('"keep" = "yes";\r\n"added" = "new";\r\n');
  });

  it("raises INVALID_STRUCTURE when the destination path is not a regular file", async () => {
    const dir = await tempDir();
    const entries = new Map([["a", entry("a", "one")]]);
    const error = await readError(adapter.write(makeResource(entries), dir));
    expect((error as AdapterError).code).toBe("INVALID_STRUCTURE");
  });

  it("raises INVALID_STRUCTURE when the destination cannot be read for another reason", async () => {
    const file = await tempFile("blocker.strings", '"x" = "1";\n');
    const underAFile = join(file, "child.strings");
    const entries = new Map([["a", entry("a", "one")]]);
    const error = await readError(adapter.write(makeResource(entries), underAFile));
    expect((error as AdapterError).code).toBe("INVALID_STRUCTURE");
  });

  it("raises INVALID_STRUCTURE when rewriting a UTF-16 destination", async () => {
    const path = await tempBinaryFile("utf16.strings", utf16leWithBom('"greeting" = "Hello";\n'));
    const entries = new Map([["greeting", entry("greeting", "Hallo")]]);
    const error = await readError(adapter.write(makeResource(entries), path));
    expect((error as AdapterError).code).toBe("INVALID_STRUCTURE");
  });
});

const STRINGSDICT_HEADER =
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n';

function stringsdict(body: string): string {
  return `${STRINGSDICT_HEADER}<plist version="1.0"><dict>${body}</dict></plist>`;
}

const PHOTO_COUNT_STRINGSDICT = stringsdict(
  "<key>photo_count</key><dict>" +
    "<key>NSStringLocalizedFormatKey</key><string>%#@photos@</string>" +
    "<key>photos</key><dict>" +
    "<key>NSStringFormatSpecTypeKey</key><string>NSStringPluralRuleType</string>" +
    "<key>NSStringFormatValueTypeKey</key><string>d</string>" +
    "<key>one</key><string>%d photo</string>" +
    "<key>other</key><string>%d photos</string>" +
    "</dict></dict>",
);

async function tempPairedFiles(
  base: string,
  stringsContent: string,
  stringsdictContent: string,
): Promise<{ readonly stringsPath: string; readonly stringsdictPath: string }> {
  const dir = await tempDir();
  const stringsPath = join(dir, `${base}.strings`);
  const stringsdictPath = join(dir, `${base}.stringsdict`);
  await writeFile(stringsPath, stringsContent, "utf8");
  await writeFile(stringsdictPath, stringsdictContent, "utf8");
  return { stringsPath, stringsdictPath };
}

describe("createAppleStringsAdapter .stringsdict sibling read", () => {
  it("merges the sibling .stringsdict's plural categories into the same LocaleResource", async () => {
    const { stringsPath } = await tempPairedFiles(
      "Localizable",
      '"greeting" = "Hello";\n',
      PHOTO_COUNT_STRINGSDICT,
    );
    const { resource } = await adapter.read(stringsPath, "de");
    expect([...resource.entries.keys()]).toEqual([
      "greeting",
      "photo_count_one",
      "photo_count_other",
    ]);
    expect(resource.entries.get("photo_count_one")?.value).toBe("%d photo");
    expect(resource.entries.get("photo_count_other")?.value).toBe("%d photos");
  });

  it("marks plural entries isPlural true and leaves the singular entry unaffected", async () => {
    const { stringsPath } = await tempPairedFiles(
      "Localizable",
      '"greeting" = "Hello";\n',
      PHOTO_COUNT_STRINGSDICT,
    );
    const { resource } = await adapter.read(stringsPath, "de");
    expect(resource.entries.get("greeting")?.isPlural).toBe(false);
    expect(resource.entries.get("greeting")?.value).toBe("Hello");
    expect(resource.entries.get("photo_count_one")?.isPlural).toBe(true);
  });

  it("extracts printf placeholders from a plural category value", async () => {
    const { stringsPath } = await tempPairedFiles("Localizable", "", PHOTO_COUNT_STRINGSDICT);
    const { resource } = await adapter.read(stringsPath, "de");
    expect(resource.entries.get("photo_count_other")?.placeholders).toEqual(["%d"]);
  });

  it("reads a .strings file with no sibling .stringsdict as before, unaffected", async () => {
    const path = await tempFile("Solo.strings", '"greeting" = "Hello";\n');
    const { resource } = await adapter.read(path, "de");
    expect([...resource.entries.keys()]).toEqual(["greeting"]);
  });

  it("handles a locale whose stringsdict omits few and two, keeping only the categories present", async () => {
    const { stringsPath } = await tempPairedFiles("Localizable", "", PHOTO_COUNT_STRINGSDICT);
    const { resource } = await adapter.read(stringsPath, "de");
    expect(resource.entries.has("photo_count_few")).toBe(false);
    expect(resource.entries.has("photo_count_two")).toBe(false);
  });

  it("rejects a colliding key defined both in .strings and as a derived plural category", async () => {
    const { stringsPath } = await tempPairedFiles(
      "Localizable",
      '"photo_count_one" = "collides";\n',
      PHOTO_COUNT_STRINGSDICT,
    );
    const error = await readError(adapter.read(stringsPath, "de"));
    expect(error).toBeInstanceOf(AdapterError);
    expect((error as AdapterError).code).toBe("INVALID_STRUCTURE");
    expect((error as AdapterError).message).toContain("photo_count_one");
  });

  it("rejects malformed sibling XML as a structured AdapterError naming the file", async () => {
    const { stringsPath, stringsdictPath } = await tempPairedFiles(
      "Localizable",
      "",
      "<plist><dict>",
    );
    const error = await readError(adapter.read(stringsPath, "de"));
    expect((error as AdapterError).code).toBe("INVALID_XML");
    expect((error as AdapterError).message).toContain(stringsdictPath);
  });

  it("rejects an unsupported plural category in the sibling naming file and key", async () => {
    const bad = stringsdict(
      "<key>k</key><dict><key>NSStringLocalizedFormatKey</key><string>%#@v@</string>" +
        "<key>v</key><dict><key>NSStringFormatSpecTypeKey</key><string>NSStringPluralRuleType</string>" +
        "<key>onez</key><string>bad</string></dict></dict>",
    );
    const { stringsPath } = await tempPairedFiles("Localizable", "", bad);
    const error = await readError(adapter.read(stringsPath, "de"));
    expect((error as AdapterError).code).toBe("INVALID_STRUCTURE");
    expect((error as AdapterError).message).toContain('"onez"');
    expect((error as AdapterError).message).toContain('"k"');
  });

  it("rejects a sibling missing its plural rule with a specific message", async () => {
    const bad = stringsdict(
      "<key>k</key><dict><key>NSStringLocalizedFormatKey</key><string>no substitution here</string></dict>",
    );
    const { stringsPath } = await tempPairedFiles("Localizable", "", bad);
    const error = await readError(adapter.read(stringsPath, "de"));
    expect((error as AdapterError).code).toBe("INVALID_STRUCTURE");
    expect((error as AdapterError).message).toContain("missing a plural rule");
  });

  it("rejects an oversized sibling .stringsdict with INPUT_TOO_LARGE", async () => {
    const dir = await tempDir();
    const stringsPath = join(dir, "Localizable.strings");
    await writeFile(stringsPath, "", "utf8");
    await writeFile(join(dir, "Localizable.stringsdict"), new Uint8Array(MAX_INPUT_BYTES + 1));
    const error = await readError(adapter.read(stringsPath, "de"));
    expect((error as AdapterError).code).toBe("INPUT_TOO_LARGE");
  });

  it("allows the standard Apple plist DOCTYPE in the sibling without rejecting it", async () => {
    const { stringsPath } = await tempPairedFiles("Localizable", "", PHOTO_COUNT_STRINGSDICT);
    await expect(adapter.read(stringsPath, "de")).resolves.toBeDefined();
  });

  it("rejects a sibling with an injected internal DTD subset as INVALID_XML", async () => {
    const malicious =
      '<?xml version="1.0"?><!DOCTYPE plist [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>' +
      "<plist><dict></dict></plist>";
    const { stringsPath } = await tempPairedFiles("Localizable", "", malicious);
    const error = await readError(adapter.read(stringsPath, "de"));
    expect((error as AdapterError).code).toBe("INVALID_XML");
  });
});

describe("createAppleStringsAdapter .stringsdict sibling write", () => {
  it("writes both .strings and .stringsdict for a brand-new locale, creating the .lproj directory", async () => {
    const dir = await tempDir();
    const stringsPath = join(dir, "de.lproj", "Localizable.strings");
    const stringsdictPath = join(dir, "de.lproj", "Localizable.stringsdict");
    const entries = new Map<string, TranslationEntry>([
      ["greeting", entry("greeting", "Hallo")],
      [
        "photo_count_one",
        {
          key: "photo_count_one",
          namespace: "Localizable",
          value: "%d Foto",
          placeholders: ["%d"],
          isPlural: true,
        },
      ],
      [
        "photo_count_other",
        {
          key: "photo_count_other",
          namespace: "Localizable",
          value: "%d Fotos",
          placeholders: ["%d"],
          isPlural: true,
        },
      ],
    ]);
    await adapter.write(makeResource(entries), stringsPath);
    expect(await readFile(stringsPath, "utf8")).toBe('"greeting" = "Hallo";\n');
    const stringsdictXml = await readFile(stringsdictPath, "utf8");
    expect(stringsdictXml).toContain("photo_count");
    expect(stringsdictXml).toContain("%d Foto");
    expect(stringsdictXml).toContain("%d Fotos");
  });

  it("does not create a sibling .stringsdict when no plural entries are written", async () => {
    const dir = await tempDir();
    const stringsPath = join(dir, "Localizable.strings");
    const entries = new Map([["greeting", entry("greeting", "Hallo")]]);
    await adapter.write(makeResource(entries), stringsPath);
    const stringsdictExists = await readFile(join(dir, "Localizable.stringsdict"), "utf8").then(
      () => true,
      () => false,
    );
    expect(stringsdictExists).toBe(false);
  });

  it("round-trips a read stringsdict back unchanged in category set and order", async () => {
    const { stringsPath, stringsdictPath } = await tempPairedFiles(
      "Localizable",
      '"greeting" = "Hello";\n',
      PHOTO_COUNT_STRINGSDICT,
    );
    const { resource } = await adapter.read(stringsPath, "de");
    await adapter.write(resource, stringsPath);
    const { resource: reread } = await adapter.read(stringsPath, "de");
    expect([...reread.entries.keys()]).toEqual([
      "greeting",
      "photo_count_one",
      "photo_count_other",
    ]);
    expect(reread.entries.get("photo_count_one")?.value).toBe("%d photo");
    expect(reread.entries.get("photo_count_other")?.value).toBe("%d photos");
    const written = await readFile(stringsdictPath, "utf8");
    expect(written).toContain("NSStringPluralRuleType");
    expect(written).toContain("%#@photos@");
  });

  it("drops a pruned plural key from the destination stringsdict on write", async () => {
    const { stringsPath, stringsdictPath } = await tempPairedFiles(
      "Localizable",
      "",
      PHOTO_COUNT_STRINGSDICT,
    );
    const { resource } = await adapter.read(stringsPath, "de");
    const entries = new Map(resource.entries);
    entries.delete("photo_count_one");
    entries.delete("photo_count_other");
    await adapter.write({ ...resource, entries }, stringsPath);
    const written = await readFile(stringsdictPath, "utf8");
    expect(written).not.toContain("photo_count");
  });
});
