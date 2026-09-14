import type { LocaleResource, TranslationEntry } from "@verbatra/core";
import { describe, expect, it } from "vitest";
import { AdapterError } from "../errors.js";
import type { AdapterFs, BoundedReadOutcome } from "../fs-port.js";
import { createMemoryAdapterFs, type MemoryAdapterFs } from "../test-support.js";
import { createIniAdapter } from "./ini-adapter.js";

const FIXTURE = [
  "; the greeting block",
  "product = verbatra",
  "",
  "[home]",
  "title = Welcome",
  "subtitle = Hello {name}, you have {0} new messages",
  "",
  "[errors]",
  "# shown when a save fails",
  'notFound = "  Not found  "',
  "",
].join("\n");

function setup(files: Record<string, string> = {}): {
  readonly adapter: ReturnType<typeof createIniAdapter>;
  readonly fs: MemoryAdapterFs;
} {
  const fs = createMemoryAdapterFs(files);
  return { adapter: createIniAdapter(fs), fs };
}

function entry(key: string, value: string): TranslationEntry {
  return { key, namespace: "en", value, placeholders: [], isPlural: false };
}

function resource(entries: readonly TranslationEntry[]): LocaleResource {
  return {
    locale: "en",
    namespace: "en",
    format: "ini",
    entries: new Map(entries.map((item) => [item.key, item])),
  };
}

async function readError(promise: Promise<unknown>): Promise<unknown> {
  return promise.catch((error: unknown) => error);
}

describe("createIniAdapter detection", () => {
  it("handles .ini and not a neighbouring flat format", () => {
    const { adapter } = setup();
    expect(adapter.canHandle("en.ini")).toBe(true);
    expect(adapter.canHandle("EN.INI")).toBe(true);
    expect(adapter.canHandle("messages.properties")).toBe(false);
  });

  it("reports format ini", () => {
    expect(setup().adapter.format).toBe("ini");
  });
});

describe("createIniAdapter read", () => {
  it("keys a sectioned entry as section.key and a sectionless entry bare, in document order", async () => {
    const { adapter } = setup({ "en.ini": FIXTURE });
    const { resource: read } = await adapter.read("en.ini", "en");
    expect([...read.entries.keys()]).toEqual([
      "product",
      "home.title",
      "home.subtitle",
      "errors.notFound",
    ]);
  });

  it("extracts single-brace placeholders", async () => {
    const { adapter } = setup({ "en.ini": FIXTURE });
    const { resource: read } = await adapter.read("en.ini", "en");
    expect(read.entries.get("home.subtitle")?.placeholders).toEqual(["{name}", "{0}"]);
  });

  it("unquotes a double-quoted value and decodes its escapes", async () => {
    const { adapter } = setup({ "en.ini": 'a = "line\\none\\ttab \\"q\\" \\\\"\n' });
    const { resource: read } = await adapter.read("en.ini", "en");
    expect(read.entries.get("a")?.value).toBe('line\none\ttab "q" \\');
  });

  it("keeps a literal dot in a section or key name out of the path, so nothing collides", async () => {
    const { adapter } = setup({ "en.ini": "a.b = global\n[a]\nb = sectioned\n" });
    const { resource: read } = await adapter.read("en.ini", "en");
    expect([...read.entries.keys()]).toEqual(["a\\.b", "a.b"]);
    expect(read.entries.get("a\\.b")?.value).toBe("global");
    expect(read.entries.get("a.b")?.value).toBe("sectioned");
  });

  it("reports no entries for comments, blank lines, and a line with no separator", async () => {
    const { adapter } = setup({ "en.ini": "; c\n# c\n\nstray text\n" });
    const {
      resource: read,
      excludedLeafPaths,
      invalidIcuKeys,
    } = await adapter.read("en.ini", "en");
    expect(read.entries.size).toBe(0);
    expect(excludedLeafPaths).toEqual([]);
    expect(invalidIcuKeys).toEqual([]);
  });

  it("passes an unknown escape through and tolerates a trailing backslash", async () => {
    const { adapter } = setup({ "en.ini": 'a = "\\q"\nb = "x\\"\n' });
    const { resource: read } = await adapter.read("en.ini", "en");
    expect(read.entries.get("a")?.value).toBe("q");
    expect(read.entries.get("b")?.value).toBe("x");
  });

  it("treats a line with an empty key as raw text, preserving it on write", async () => {
    const { adapter, fs } = setup({ "en.ini": "= orphan\na = A\n" });
    const { resource: read } = await adapter.read("en.ini", "en");
    expect([...read.entries.keys()]).toEqual(["a"]);
    await adapter.write(read, "en.ini");
    expect(fs.files.get("en.ini")).toBe("= orphan\na = A\n");
  });

  it("accepts a section header that carries a trailing comment", async () => {
    const source = "[home] ; the home block\ntitle = Welcome\n[about]\t# about us\ntitle = About\n";
    const { adapter, fs } = setup({ "en.ini": source });
    const { resource: read } = await adapter.read("en.ini", "en");
    expect([...read.entries.keys()]).toEqual(["home.title", "about.title"]);
    await adapter.write(read, "en.ini");
    expect(fs.files.get("en.ini")).toBe(source);
  });

  it("rejects text after the closing bracket that is not a comment", async () => {
    const { adapter } = setup({ "en.ini": "[home] oops\ntitle = Welcome\n" });
    const error = await readError(adapter.read("en.ini", "en"));
    expect(error).toBeInstanceOf(AdapterError);
    expect((error as AdapterError).code).toBe("INVALID_STRUCTURE");
  });

  it("rejects an unterminated section header as a structured AdapterError", async () => {
    const { adapter } = setup({ "en.ini": "[home\ntitle = Welcome\n" });
    const error = await readError(adapter.read("en.ini", "en"));
    expect(error).toBeInstanceOf(AdapterError);
    expect((error as AdapterError).code).toBe("INVALID_STRUCTURE");
  });

  it("rejects an empty section name as a structured AdapterError", async () => {
    const { adapter } = setup({ "en.ini": "[  ]\ntitle = Welcome\n" });
    expect(((await readError(adapter.read("en.ini", "en"))) as AdapterError).code).toBe(
      "INVALID_STRUCTURE",
    );
  });
});

describe("createIniAdapter write", () => {
  it("round-trips the document byte-identically, comments, spacing, and quoting included", async () => {
    const { adapter, fs } = setup({ "en.ini": FIXTURE });
    const { resource: read } = await adapter.read("en.ini", "en");
    await adapter.write(read, "en.ini");
    expect(fs.files.get("en.ini")).toBe(FIXTURE);
  });

  it("rewrites only the value, leaving the key spelling and separator spacing alone", async () => {
    const { adapter, fs } = setup({ "en.ini": "[home]\n  title   =   Welcome   \n" });
    const { resource: read } = await adapter.read("en.ini", "en");
    const updated = new Map(read.entries);
    updated.set("home.title", entry("home.title", "Willkommen"));
    await adapter.write({ ...read, entries: updated }, "en.ini");
    expect(fs.files.get("en.ini")).toBe("[home]\n  title   =   Willkommen   \n");
  });

  it("keeps a value's quoting when the source value was quoted", async () => {
    const { adapter, fs } = setup({ "en.ini": 'a = "x"\n' });
    const { resource: read } = await adapter.read("en.ini", "en");
    const updated = new Map(read.entries);
    updated.set("a", entry("a", 'y"z'));
    await adapter.write({ ...read, entries: updated }, "en.ini");
    expect(fs.files.get("en.ini")).toBe('a = "y\\"z"\n');
  });

  it("quotes an unquoted value that would otherwise lose its surrounding space", async () => {
    const { adapter, fs } = setup({ "en.ini": "a = x\n" });
    const { resource: read } = await adapter.read("en.ini", "en");
    const updated = new Map(read.entries);
    updated.set("a", entry("a", " padded "));
    await adapter.write({ ...read, entries: updated }, "en.ini");
    expect(fs.files.get("en.ini")).toBe('a = " padded "\n');
  });

  it("appends a new key inside its own section rather than at the end of the file", async () => {
    const { adapter, fs } = setup({ "en.ini": FIXTURE });
    const { resource: read } = await adapter.read("en.ini", "en");
    const updated = new Map(read.entries);
    updated.set("home.footer", entry("home.footer", "Bye"));
    await adapter.write({ ...read, entries: updated }, "en.ini");
    const written = fs.files.get("en.ini") ?? "";
    expect(written).toContain("subtitle = Hello {name}, you have {0} new messages\nfooter=Bye\n");
    expect(written.endsWith('notFound = "  Not found  "\n')).toBe(true);
  });

  it("creates a section block at the end for a key whose section the file does not have", async () => {
    const { adapter, fs } = setup({ "en.ini": "[home]\ntitle = Welcome\n" });
    const { resource: read } = await adapter.read("en.ini", "en");
    const updated = new Map(read.entries);
    updated.set("about.title", entry("about.title", "About"));
    await adapter.write({ ...read, entries: updated }, "en.ini");
    expect(fs.files.get("en.ini")).toBe("[home]\ntitle = Welcome\n[about]\ntitle=About\n");
  });

  it("puts a new sectionless key above the first section header", async () => {
    const { adapter, fs } = setup({ "en.ini": "[home]\ntitle = Welcome\n" });
    const { resource: read } = await adapter.read("en.ini", "en");
    const updated = new Map(read.entries);
    updated.set("product", entry("product", "verbatra"));
    await adapter.write({ ...read, entries: updated }, "en.ini");
    expect(fs.files.get("en.ini")).toBe("product=verbatra\n[home]\ntitle = Welcome\n");
  });

  it("round-trips a section that holds only comments, adding no entry for it", async () => {
    const source = "[home]\n; nothing here yet\n\n[about]\ntitle = About\n";
    const { adapter, fs } = setup({ "en.ini": source });
    const { resource: read } = await adapter.read("en.ini", "en");
    expect([...read.entries.keys()]).toEqual(["about.title"]);
    await adapter.write(read, "en.ini");
    expect(fs.files.get("en.ini")).toBe(source);
  });

  it("inserts a new key into a section that holds only comments", async () => {
    const { adapter, fs } = setup({
      "en.ini": "[home]\n; nothing here yet\n\n[about]\ntitle = About\n",
    });
    const { resource: read } = await adapter.read("en.ini", "en");
    const updated = new Map(read.entries);
    updated.set("home.title", entry("home.title", "Welcome"));
    await adapter.write({ ...read, entries: updated }, "en.ini");
    expect(fs.files.get("en.ini")).toBe(
      "[home]\n; nothing here yet\ntitle=Welcome\n\n[about]\ntitle = About\n",
    );
  });

  it("drops an entry the resource no longer carries", async () => {
    const { adapter, fs } = setup({ "en.ini": "[home]\na = A\nb = B\n" });
    const { resource: read } = await adapter.read("en.ini", "en");
    const updated = new Map(read.entries);
    updated.delete("home.b");
    await adapter.write({ ...read, entries: updated }, "en.ini");
    expect(fs.files.get("en.ini")).toBe("[home]\na = A\n");
  });

  it("writes a fresh document when the destination does not exist yet", async () => {
    const { adapter, fs } = setup();
    await adapter.write(
      resource([entry("home.title", "Welcome"), entry("product", "verbatra")]),
      "de.ini",
    );
    expect(fs.files.get("de.ini")).toBe("product=verbatra\n[home]\ntitle=Welcome\n");
  });

  it("preserves a CRLF document's line terminator", async () => {
    const source = "[home]\r\ntitle = Welcome\r\n";
    const { adapter, fs } = setup({ "en.ini": source });
    const { resource: read } = await adapter.read("en.ini", "en");
    await adapter.write(read, "en.ini");
    expect(fs.files.get("en.ini")).toBe(source);
  });

  it("refuses a key the format cannot represent rather than writing an unparseable file", async () => {
    const { adapter } = setup({ "en.ini": "a = A\n" });
    const error = await readError(adapter.write(resource([entry("a=b", "x")]), "en.ini"));
    expect(error).toBeInstanceOf(AdapterError);
    expect((error as AdapterError).code).toBe("INVALID_STRUCTURE");
  });

  it("refuses a section name the format cannot represent", async () => {
    const { adapter } = setup({ "en.ini": "a = A\n" });
    const error = await readError(adapter.write(resource([entry("a]b.k", "x")]), "en.ini"));
    expect((error as AdapterError).code).toBe("INVALID_STRUCTURE");
  });

  it("lets a structured error from the destination read through with its own code", async () => {
    const fs: AdapterFs = {
      async readBounded(): Promise<BoundedReadOutcome> {
        throw new AdapterError("INPUT_TOO_LARGE", "too large");
      },
      async writeFileAtomic(): Promise<void> {},
    };
    const error = await readError(
      createIniAdapter(fs).write(resource([entry("a", "A")]), "en.ini"),
    );
    expect((error as AdapterError).code).toBe("INPUT_TOO_LARGE");
  });

  it("reports an unreadable destination as a structured AdapterError", async () => {
    const fs: AdapterFs = {
      async readBounded(): Promise<BoundedReadOutcome> {
        throw Object.assign(new Error("EACCES"), { code: "EACCES" });
      },
      async writeFileAtomic(): Promise<void> {},
    };
    const error = await readError(
      createIniAdapter(fs).write(resource([entry("a", "A")]), "en.ini"),
    );
    expect(error).toBeInstanceOf(AdapterError);
    expect((error as AdapterError).code).toBe("INVALID_STRUCTURE");
  });

  it("keeps the first of two duplicate keys and drops the later line", async () => {
    const { adapter, fs } = setup({ "en.ini": "a = one\na = two\n" });
    const { resource: read } = await adapter.read("en.ini", "en");
    expect(read.entries.get("a")?.value).toBe("two");
    await adapter.write(read, "en.ini");
    expect(fs.files.get("en.ini")).toBe("a = two\n");
  });
});
