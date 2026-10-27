import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cpuScalingRatio, LINEAR_MAX_RATIO, LINEAR_SCALE } from "@verbatra/config/scaling";
import type { LocaleResource, SupportedFormat, TranslationEntry } from "@verbatra/core";
import { describe, expect, it } from "vitest";
import type { FormatAdapter } from "../adapter.js";
import { createDefaultRegistry } from "../default-registry.js";
import { AdapterError } from "../errors.js";
import { parsePropertiesEntries } from "./parse.js";
import { createPropertiesAdapter } from "./properties-adapter.js";

const adapter = createPropertiesAdapter();

async function tempFile(name: string, content: string): Promise<string> {
  const path = join(await mkdtemp(join(tmpdir(), "verbatra-props-")), name);
  await writeFile(path, content);
  return path;
}

async function tempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "verbatra-props-"));
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
  return { locale: "de", namespace: "messages", format: "properties", entries };
}

function entry(key: string, value: string): TranslationEntry {
  return { key, namespace: "messages", value, placeholders: [], isPlural: false };
}

describe("createPropertiesAdapter detection", () => {
  it("handles .properties by extension only", () => {
    expect(adapter.canHandle("messages.properties")).toBe(true);
    expect(adapter.canHandle("messages.json")).toBe(false);
  });

  it("reports format properties", () => {
    expect(adapter.format).toBe("properties");
  });

  it("resolves through the default registry by extension detection", () => {
    const resolved = resolveViaRegistry("messages.properties");
    expect(resolved.format).toBe("properties");
  });

  it("resolves through the default registry by explicit format", () => {
    const resolved = resolveViaRegistry("anything", "properties");
    expect(resolved.format).toBe("properties");
  });
});

describe("createPropertiesAdapter read", () => {
  it("returns one entry per key with the value decoded", async () => {
    const path = await tempFile("m.properties", "greeting=Hello\nname=World\n");
    const { resource } = await adapter.read(path, "de");
    expect([...resource.entries.keys()]).toEqual(["greeting", "name"]);
    expect(resource.entries.get("greeting")?.value).toBe("Hello");
    expect(resource.entries.get("name")?.value).toBe("World");
  });

  it("accepts the colon and bare-whitespace separators", async () => {
    const path = await tempFile("m.properties", "a:one\nb two\nc = three\n");
    const { resource } = await adapter.read(path, "de");
    expect(resource.entries.get("a")?.value).toBe("one");
    expect(resource.entries.get("b")?.value).toBe("two");
    expect(resource.entries.get("c")?.value).toBe("three");
  });

  it("keeps a dotted key flat, never split into a tree", async () => {
    const { resource } = await adapter.read(
      await tempFile("m.properties", "app.title.header=Hello\n"),
      "de",
    );
    expect([...resource.entries.keys()]).toEqual(["app.title.header"]);
    expect(resource.entries.get("app.title.header")?.value).toBe("Hello");
  });

  it("treats a key with no separator as an empty value", async () => {
    const { resource } = await adapter.read(await tempFile("m.properties", "flag\n"), "de");
    expect(resource.entries.get("flag")?.value).toBe("");
  });

  it("decodes the standard escapes and an escaped separator in the key", async () => {
    const path = await tempFile("m.properties", "a\\=b=x\\ty\\nz\\=w\n");
    const { resource } = await adapter.read(path, "de");
    expect(resource.entries.get("a=b")?.value).toBe("x\ty\nz=w");
  });

  it("decodes a \\uXXXX escape", async () => {
    const { resource } = await adapter.read(
      await tempFile("m.properties", "caf=caf\\u00e9\n"),
      "de",
    );
    expect(resource.entries.get("caf")?.value).toBe("café");
  });

  it("joins backslash line continuations into one value", async () => {
    const path = await tempFile("m.properties", "note=line one \\\n  line two\n");
    const { resource } = await adapter.read(path, "de");
    expect(resource.entries.get("note")?.value).toBe("line one line two");
  });

  it("produces no entry for comment and blank lines", async () => {
    const source = "# a comment\n! also a comment\n\ngreeting=Hello\n";
    const { resource } = await adapter.read(await tempFile("m.properties", source), "de");
    expect([...resource.entries.keys()]).toEqual(["greeting"]);
  });

  it("keeps the last value and first position for a duplicate key", async () => {
    const { resource } = await adapter.read(
      await tempFile("m.properties", "k=first\nother=x\nk=second\n"),
      "de",
    );
    expect([...resource.entries.keys()]).toEqual(["k", "other"]);
    expect(resource.entries.get("k")?.value).toBe("second");
  });

  it("populates placeholders from the value", async () => {
    const { resource } = await adapter.read(await tempFile("m.properties", "hi=Hello {0}\n"), "de");
    expect(resource.entries.get("hi")?.placeholders).toEqual(["{0}"]);
  });

  it("rejects a malformed unicode escape as a structured AdapterError", async () => {
    const error = await readError(
      adapter.read(await tempFile("bad.properties", "k=\\u12zz\n"), "de"),
    );
    expect(error).toBeInstanceOf(AdapterError);
    expect((error as AdapterError).code).toBe("INVALID_STRUCTURE");
  });

  it("rejects a truncated unicode escape as a structured AdapterError", async () => {
    const error = await readError(
      adapter.read(await tempFile("bad.properties", "k=\\u12\n"), "de"),
    );
    expect((error as AdapterError).code).toBe("INVALID_STRUCTURE");
  });

  it("decodes carriage-return, form-feed, and unknown escapes", async () => {
    const { resource } = await adapter.read(
      await tempFile("m.properties", "k=a\\rb\\fc\\dd\n"),
      "de",
    );
    expect(resource.entries.get("k")?.value).toBe("a\rb\fcdd");
  });

  it("returns no entries for an empty file", async () => {
    const { resource } = await adapter.read(await tempFile("m.properties", ""), "de");
    expect(resource.entries.size).toBe(0);
  });

  it("reads a file with no trailing newline", async () => {
    const { resource } = await adapter.read(await tempFile("m.properties", "a=1\nb=2"), "de");
    expect([...resource.entries.keys()]).toEqual(["a", "b"]);
    expect(resource.entries.get("b")?.value).toBe("2");
  });

  it("drops a dangling continuation backslash at end of file", async () => {
    const { resource } = await adapter.read(await tempFile("m.properties", "k=v\\"), "de");
    expect(resource.entries.get("k")?.value).toBe("v");
  });

  it("parses a value spread over many continuations in bounded time (algorithmic-DoS guard)", async () => {
    const lines = 200_000;
    const contentOf = (n: number) => `k=${"a\\\n".repeat(n)}z\n`;
    const path = await tempFile("m.properties", contentOf(lines));
    const { resource } = await adapter.read(path, "de");
    expect(resource.entries.size).toBe(1);
    expect(resource.entries.get("k")?.value).toBe(`${"a".repeat(lines)}z`);
    const parse = (content: string) => parsePropertiesEntries(content, "m");
    expect(cpuScalingRatio(parse, contentOf(lines / LINEAR_SCALE), contentOf(lines))).toBeLessThan(
      LINEAR_MAX_RATIO,
    );
  });
});

describe("createPropertiesAdapter write (round-trip fidelity)", () => {
  const canonical =
    "# Greeting section\ngreeting=Hello\nname=World\n\n# Farewell\nfarewell=Goodbye\n";

  it("reproduces a canonical file byte for byte when nothing changes", async () => {
    const path = await tempFile("m.properties", canonical);
    const { resource } = await adapter.read(path, "de");
    await adapter.write(resource, path);
    expect(await readFile(path, "utf8")).toBe(canonical);
  });

  it("preserves comments, the blank line, and key order on round-trip", async () => {
    const path = await tempFile("m.properties", canonical);
    const { resource } = await adapter.read(path, "de");
    await adapter.write(resource, path);
    const written = await readFile(path, "utf8");
    expect(written).toContain("# Greeting section");
    expect(written).toContain("# Farewell");
    expect(written).toContain("\n\n");
    const reread = await adapter.read(path, "de");
    expect([...reread.resource.entries.keys()]).toEqual(["greeting", "name", "farewell"]);
  });

  it("writes a changed value while keeping the surrounding structure", async () => {
    const path = await tempFile("m.properties", canonical);
    const { resource } = await adapter.read(path, "de");
    const entries = new Map(resource.entries);
    const greeting = entries.get("greeting");
    if (greeting) {
      entries.set("greeting", { ...greeting, value: "Hallo" });
    }
    await adapter.write({ ...resource, entries }, path);
    const written = await readFile(path, "utf8");
    expect(written).toContain("greeting=Hallo");
    expect(written).toContain("# Greeting section");
  });

  it("normalizes the colon separator to the canonical equals on write", async () => {
    const path = await tempFile("m.properties", "a:one\n");
    const { resource } = await adapter.read(path, "de");
    await adapter.write(resource, path);
    expect(await readFile(path, "utf8")).toBe("a=one\n");
  });

  it("escapes non-ASCII code points to ASCII-safe \\uXXXX on write", async () => {
    const path = await tempFile("m.properties", "caf=café\n");
    const { resource } = await adapter.read(path, "de");
    await adapter.write(resource, path);
    expect(await readFile(path, "utf8")).toBe("caf=caf\\u00E9\n");
  });

  it("escapes a leading space in a value but not interior spaces", async () => {
    const entries = new Map([["k", entry("k", " a b")]]);
    const path = join(await tempDir(), "m.properties");
    await adapter.write(makeResource(entries), path);
    expect(await readFile(path, "utf8")).toBe("k=\\ a b\n");
  });

  it("escapes the separator and comment characters inside a key", async () => {
    const entries = new Map([["a=b:c#d!e f", entry("a=b:c#d!e f", "v")]]);
    const path = join(await tempDir(), "m.properties");
    await adapter.write(makeResource(entries), path);
    expect(await readFile(path, "utf8")).toBe("a\\=b\\:c\\#d\\!e\\ f=v\n");
  });

  it("appends a source key the destination lacks, in iteration order", async () => {
    const path = await tempFile("m.properties", "greeting=Hello\n");
    const entries = new Map([
      ["greeting", entry("greeting", "Hello")],
      ["farewell", entry("farewell", "Bye")],
    ]);
    await adapter.write(makeResource(entries), path);
    expect(await readFile(path, "utf8")).toBe("greeting=Hello\nfarewell=Bye\n");
  });

  it("drops a destination key no longer present in the entries", async () => {
    const path = await tempFile("m.properties", "keep=yes\ngone=no\n");
    const entries = new Map([["keep", entry("keep", "yes")]]);
    await adapter.write(makeResource(entries), path);
    expect(await readFile(path, "utf8")).toBe("keep=yes\n");
  });

  it("synthesizes a file from entries alone when the destination does not exist", async () => {
    const path = join(await tempDir(), "absent.properties");
    const entries = new Map([["a", entry("a", "one")]]);
    await adapter.write(makeResource(entries), path);
    expect(await readFile(path, "utf8")).toBe("a=one\n");
  });

  it("writes an empty file for an empty entry set with no destination", async () => {
    const path = join(await tempDir(), "empty.properties");
    await adapter.write(makeResource(new Map()), path);
    expect(await readFile(path, "utf8")).toBe("");
  });

  it("raises INVALID_STRUCTURE when the destination path is not a regular file", async () => {
    const dir = await tempDir();
    const entries = new Map([["a", entry("a", "one")]]);
    const error = await readError(adapter.write(makeResource(entries), dir));
    expect((error as AdapterError).code).toBe("INVALID_STRUCTURE");
  });

  it("raises INVALID_STRUCTURE when the destination cannot be read for another reason", async () => {
    const file = await tempFile("blocker.properties", "x=1\n");
    const underAFile = join(file, "child.properties");
    const entries = new Map([["a", entry("a", "one")]]);
    const error = await readError(adapter.write(makeResource(entries), underAFile));
    expect((error as AdapterError).code).toBe("INVALID_STRUCTURE");
  });

  it("collapses a duplicate destination key to one line and stays stable across writes", async () => {
    const path = await tempFile("m.properties", "k=first\nother=x\nk=second\n");
    const first = await adapter.read(path, "de");
    await adapter.write(first.resource, path);
    const afterFirst = await readFile(path, "utf8");
    expect(afterFirst).toBe("k=second\nother=x\n");
    const second = await adapter.read(path, "de");
    await adapter.write(second.resource, path);
    expect(await readFile(path, "utf8")).toBe(afterFirst);
  });

  it("escapes control characters and a backslash in a value on write", async () => {
    const path = join(await tempDir(), "m.properties");
    const value = `a\tb\nc\rd\fe\\f${String.fromCharCode(1)}g`;
    const entries = new Map([["k", entry("k", value)]]);
    await adapter.write(makeResource(entries), path);
    expect(await readFile(path, "utf8")).toBe("k=a\\tb\\nc\\rd\\fe\\\\f\\u0001g\n");
  });
});

describe("createPropertiesAdapter write (line-terminator preservation)", () => {
  it("rewrites a CRLF destination with CRLF, not LF", async () => {
    const path = await tempFile("m.properties", "# c\r\na=one\r\nb=two\r\n");
    const { resource } = await adapter.read(path, "de");
    await adapter.write(resource, path);
    expect(await readFile(path, "utf8")).toBe("# c\r\na=one\r\nb=two\r\n");
  });

  it("leaves an LF destination on LF", async () => {
    const path = await tempFile("m.properties", "# c\na=one\nb=two\n");
    const { resource } = await adapter.read(path, "de");
    await adapter.write(resource, path);
    expect(await readFile(path, "utf8")).toBe("# c\na=one\nb=two\n");
  });

  it("rewrites a CR-only destination with CR", async () => {
    const path = await tempFile("m.properties", "# c\ra=one\rb=two\r");
    const { resource } = await adapter.read(path, "de");
    await adapter.write(resource, path);
    expect(await readFile(path, "utf8")).toBe("# c\ra=one\rb=two\r");
  });

  it("writes LF when the destination does not exist", async () => {
    const path = join(await tempDir(), "m.properties");
    const entries = new Map([["a", entry("a", "one")]]);
    await adapter.write(makeResource(entries), path);
    expect(await readFile(path, "utf8")).toBe("a=one\n");
  });

  it("converts a mixed destination entirely to CRLF when any CRLF is present", async () => {
    const path = await tempFile("m.properties", "# c\na=one\nb=two\r\nc=three\n");
    const { resource } = await adapter.read(path, "de");
    await adapter.write(resource, path);
    expect(await readFile(path, "utf8")).toBe("# c\r\na=one\r\nb=two\r\nc=three\r\n");
  });

  it.each([
    ["CRLF", "# c\r\na=one\r\nb=two\r\n"],
    ["LF", "# c\na=one\nb=two\n"],
    ["CR", "# c\ra=one\rb=two\r"],
    ["mixed CRLF and LF", "# c\na=one\nb=two\r\nc=three\n"],
    ["mixed CR and LF", "# c\na=one\rb=two\n"],
  ])("stays a fixed point across two writes for a %s destination", async (_style, initial) => {
    const path = await tempFile("m.properties", initial);
    await adapter.write((await adapter.read(path, "de")).resource, path);
    const afterFirst = await readFile(path, "utf8");
    await adapter.write((await adapter.read(path, "de")).resource, path);
    expect(await readFile(path, "utf8")).toBe(afterFirst);
  });

  it("keeps a CRLF destination's comments, blank line, and key order", async () => {
    const path = await tempFile(
      "m.properties",
      "# Greeting\r\ngreeting=Hello\r\n\r\n# Farewell\r\nfarewell=Bye\r\n",
    );
    const { resource } = await adapter.read(path, "de");
    const entries = new Map(resource.entries);
    entries.set("greeting", entry("greeting", "Hallo"));
    await adapter.write({ ...resource, entries }, path);

    expect(await readFile(path, "utf8")).toBe(
      "# Greeting\r\ngreeting=Hallo\r\n\r\n# Farewell\r\nfarewell=Bye\r\n",
    );
  });

  it("still writes a value's own CR and LF as escapes, not as terminators", async () => {
    const path = await tempFile("m.properties", "a=one\r\n");
    const entries = new Map([["a", entry("a", "x\r\ny")]]);
    await adapter.write(makeResource(entries), path);
    expect(await readFile(path, "utf8")).toBe("a=x\\r\\ny\r\n");
  });
});
