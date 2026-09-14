import type { LocaleResource, TranslationEntry } from "@verbatra/core";
import { describe, expect, it } from "vitest";
import { AdapterError } from "../errors.js";
import type { AdapterFs, BoundedReadOutcome } from "../fs-port.js";
import { createMemoryAdapterFs, type MemoryAdapterFs } from "../test-support.js";
import { createResxAdapter } from "./resx-adapter.js";

const FIXTURE = `<?xml version="1.0" encoding="utf-8"?>
<root>
  <resheader name="resmimetype">
    <value>text/microsoft-resx</value>
  </resheader>
  <resheader name="version">
    <value>2.0</value>
  </resheader>
  <data name="Greeting" xml:space="preserve">
    <value>Hello {0}, you have {1:N0} new messages</value>
    <comment>Shown on the dashboard</comment>
  </data>
  <data name="Farewell" xml:space="preserve">
    <value>Goodbye</value>
  </data>
  <data name="Logo" type="System.Drawing.Bitmap, System.Drawing" mimetype="application/x-microsoft.net.object.bytearray.base64">
    <value>iVBORw0KGgo=</value>
  </data>
  <data name="&gt;&gt;$this.Type" xml:space="preserve">
    <value>System.Windows.Forms.Form</value>
  </data>
  <data name="$this.Text" xml:space="preserve">
    <value>Designer caption</value>
  </data>
</root>
`;

function setup(files: Record<string, string> = {}): {
  readonly adapter: ReturnType<typeof createResxAdapter>;
  readonly fs: MemoryAdapterFs;
} {
  const fs = createMemoryAdapterFs(files);
  return { adapter: createResxAdapter(fs), fs };
}

function entry(key: string, value: string): TranslationEntry {
  return { key, namespace: "Resources", value, placeholders: [], isPlural: false };
}

function resource(entries: readonly TranslationEntry[]): LocaleResource {
  return {
    locale: "de",
    namespace: "Resources",
    format: "resx",
    entries: new Map(entries.map((item) => [item.key, item])),
  };
}

async function readError(promise: Promise<unknown>): Promise<unknown> {
  return promise.catch((error: unknown) => error);
}

describe("createResxAdapter detection", () => {
  it("handles .resx and leaves .xml to the Android adapter", () => {
    const { adapter } = setup();
    expect(adapter.canHandle("Resources.resx")).toBe(true);
    expect(adapter.canHandle("Resources.RESX")).toBe(true);
    expect(adapter.canHandle("strings.xml")).toBe(false);
  });

  it("reports format resx", () => {
    expect(setup().adapter.format).toBe("resx");
  });
});

describe("createResxAdapter read", () => {
  it("reads only the plain string entries, in document order", async () => {
    const { adapter } = setup({ "Resources.resx": FIXTURE });
    const { resource: read } = await adapter.read("Resources.resx", "en");
    expect([...read.entries.keys()]).toEqual(["Greeting", "Farewell"]);
  });

  it("skips a data element carrying a type or mimetype attribute", async () => {
    const { adapter } = setup({ "Resources.resx": FIXTURE });
    const { resource: read } = await adapter.read("Resources.resx", "en");
    expect(read.entries.has("Logo")).toBe(false);
  });

  it("skips the designer metadata names that start with >> or $", async () => {
    const { adapter } = setup({ "Resources.resx": FIXTURE });
    const { resource: read } = await adapter.read("Resources.resx", "en");
    expect(read.entries.has(">>$this.Type")).toBe(false);
    expect(read.entries.has("$this.Text")).toBe(false);
  });

  it("carries a comment element across as the entry description", async () => {
    const { adapter } = setup({ "Resources.resx": FIXTURE });
    const { resource: read } = await adapter.read("Resources.resx", "en");
    expect(read.entries.get("Greeting")?.description).toBe("Shown on the dashboard");
    expect(read.entries.get("Farewell")?.description).toBeUndefined();
  });

  it("extracts composite format items including alignment and format specifier", async () => {
    const { adapter } = setup({ "Resources.resx": FIXTURE });
    const { resource: read } = await adapter.read("Resources.resx", "en");
    expect(read.entries.get("Greeting")?.placeholders).toEqual(["{0}", "{1:N0}"]);
  });

  it("reports no invalid message keys and no excluded leaf paths", async () => {
    const { adapter } = setup({ "Resources.resx": FIXTURE });
    const result = await adapter.read("Resources.resx", "en");
    expect(result.invalidIcuKeys).toEqual([]);
    expect(result.excludedLeafPaths).toEqual([]);
  });

  it("rejects a document whose root element is not root", async () => {
    const { adapter } = setup({ "Resources.resx": "<resources><string/></resources>" });
    const error = await readError(adapter.read("Resources.resx", "en"));
    expect(error).toBeInstanceOf(AdapterError);
    expect((error as AdapterError).code).toBe("INVALID_STRUCTURE");
  });

  it("rejects malformed XML as a structured AdapterError", async () => {
    const { adapter } = setup({ "Resources.resx": "<root><data></root>" });
    expect(((await readError(adapter.read("Resources.resx", "en"))) as AdapterError).code).toBe(
      "INVALID_XML",
    );
  });

  it("rejects a document declaring a DTD or an entity", async () => {
    const { adapter } = setup({
      "Resources.resx": '<!DOCTYPE root [<!ENTITY x "y">]>\n<root></root>',
    });
    expect(((await readError(adapter.read("Resources.resx", "en"))) as AdapterError).code).toBe(
      "INVALID_XML",
    );
  });

  it("skips a data element whose value holds markup rather than plain text", async () => {
    const { adapter } = setup({
      "Resources.resx": '<root><data name="A"><value>a<b/>c</value></data></root>',
    });
    const { resource: read } = await adapter.read("Resources.resx", "en");
    expect(read.entries.size).toBe(0);
  });
});

describe("createResxAdapter write", () => {
  it("round-trips the document byte-identically, schema preamble and skipped entries included", async () => {
    const { adapter, fs } = setup({ "Resources.resx": FIXTURE });
    const { resource: read } = await adapter.read("Resources.resx", "en");
    await adapter.write(read, "Resources.resx");
    expect(fs.files.get("Resources.resx")).toBe(FIXTURE);
  });

  it("rewrites the value of a matched entry and nothing else in its element", async () => {
    const { adapter, fs } = setup({ "Resources.resx": FIXTURE });
    const { resource: read } = await adapter.read("Resources.resx", "en");
    const updated = new Map(read.entries);
    updated.set("Farewell", entry("Farewell", "Auf Wiedersehen"));
    await adapter.write({ ...read, entries: updated }, "Resources.resx");
    const written = fs.files.get("Resources.resx") ?? "";
    expect(written).toContain(
      '<data name="Farewell" xml:space="preserve">\n    <value>Auf Wiedersehen</value>\n  </data>',
    );
    expect(written).toContain("<comment>Shown on the dashboard</comment>");
  });

  it("appends a new entry as a data element that preserves whitespace", async () => {
    const { adapter, fs } = setup({ "Resources.resx": FIXTURE });
    const { resource: read } = await adapter.read("Resources.resx", "en");
    const updated = new Map(read.entries);
    updated.set("Added", entry("Added", "  spaced  "));
    await adapter.write({ ...read, entries: updated }, "Resources.resx");
    expect(fs.files.get("Resources.resx")).toMatch(
      / {2}<\/data>\n {2}<data name="Added" xml:space="preserve"><value> {2}spaced {2}<\/value><\/data>\n<\/root>\n$/,
    );
  });

  it("removes a translatable entry the resource no longer carries, leaving the skipped ones", async () => {
    const { adapter, fs } = setup({ "Resources.resx": FIXTURE });
    const { resource: read } = await adapter.read("Resources.resx", "en");
    const updated = new Map(read.entries);
    updated.delete("Farewell");
    await adapter.write({ ...read, entries: updated }, "Resources.resx");
    const written = fs.files.get("Resources.resx") ?? "";
    expect(written).not.toContain('name="Farewell"');
    expect(written).toContain('name="Logo"');
    expect(written).toContain('name="&gt;&gt;$this.Type"');
  });

  it("never overwrites a typed data element, and never silently discards the entry either", async () => {
    const { adapter, fs } = setup({ "Resources.resx": FIXTURE });
    const { resource: read } = await adapter.read("Resources.resx", "en");
    const updated = new Map(read.entries);
    updated.set("Logo", entry("Logo", "translated!"));
    const error = await readError(adapter.write({ ...read, entries: updated }, "Resources.resx"));
    expect((error as AdapterError).code).toBe("INVALID_STRUCTURE");
    const written = fs.files.get("Resources.resx") ?? "";
    expect(written).toBe(FIXTURE);
    expect(written).not.toContain("translated!");
  });

  it("synthesizes a valid document when the target locale file does not exist yet", async () => {
    const { adapter, fs } = setup();
    await adapter.write(resource([entry("Greeting", "Hallo {0}")]), "Resources.de.resx");
    const written = fs.files.get("Resources.de.resx") ?? "";
    expect(written).toBe(
      [
        '<?xml version="1.0" encoding="utf-8"?>',
        "<root>",
        '  <resheader name="resmimetype"><value>text/microsoft-resx</value></resheader>',
        '  <resheader name="version"><value>2.0</value></resheader>',
        '  <resheader name="reader"><value>System.Resources.ResXResourceReader, System.Windows.Forms, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b77a5c561934e089</value></resheader>',
        '  <resheader name="writer"><value>System.Resources.ResXResourceWriter, System.Windows.Forms, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b77a5c561934e089</value></resheader>',
        '  <data name="Greeting" xml:space="preserve"><value>Hallo {0}</value></data>',
        "</root>",
        "",
      ].join("\n"),
    );
  });

  it("reads back what it synthesized and rewrites it unchanged", async () => {
    const { adapter, fs } = setup();
    await adapter.write(resource([entry("Greeting", "Hallo {0}")]), "Resources.de.resx");
    const synthesized = fs.files.get("Resources.de.resx");
    const { resource: read } = await adapter.read("Resources.de.resx", "de");
    expect(read.entries.get("Greeting")?.value).toBe("Hallo {0}");
    await adapter.write(read, "Resources.de.resx");
    expect(fs.files.get("Resources.de.resx")).toBe(synthesized);
  });

  it("gives a data element with no value child one before writing into it", async () => {
    const { adapter, fs } = setup({ "Resources.resx": '<root><data name="A"/></root>' });
    await adapter.write(resource([entry("A", "text")]), "Resources.resx");
    expect(fs.files.get("Resources.resx")).toBe(
      '<root><data name="A"><value>text</value></data></root>',
    );
  });

  it("refuses to drop a translated value when the destination entry is a typed resource", async () => {
    const source = '<root><data name="Count" type="System.Int32"><value>5</value></data></root>';
    const { adapter, fs } = setup({ "Resources.resx": source });
    const error = await readError(
      adapter.write(resource([entry("Count", "Fuenf")]), "Resources.resx"),
    );
    expect(error).toBeInstanceOf(AdapterError);
    expect((error as AdapterError).code).toBe("INVALID_STRUCTURE");
    expect((error as AdapterError).message).toContain("Count");
    expect(fs.files.get("Resources.resx")).toBe(source);
  });

  it("refuses to drop a translated value when the destination entry is designer metadata", async () => {
    const { adapter } = setup({
      "Resources.resx": '<root><data name="$this.Text"><value>Caption</value></data></root>',
    });
    const error = await readError(
      adapter.write(resource([entry("$this.Text", "Beschriftung")]), "Resources.resx"),
    );
    expect((error as AdapterError).code).toBe("INVALID_STRUCTURE");
  });

  it("refuses to drop a translated value when the destination value holds markup", async () => {
    const { adapter } = setup({
      "Resources.resx": '<root><data name="A"><value>a<b/>c</value></data></root>',
    });
    const error = await readError(adapter.write(resource([entry("A", "x")]), "Resources.resx"));
    expect((error as AdapterError).code).toBe("INVALID_STRUCTURE");
  });

  it("leaves a data element whose value holds markup untouched when no entry competes for it", async () => {
    const source = '<root><data name="A" xml:space="preserve"><value>a<b/>c</value></data></root>';
    const { adapter, fs } = setup({ "Resources.resx": source });
    await adapter.write(resource([]), "Resources.resx");
    expect(fs.files.get("Resources.resx")).toBe(source);
  });

  it("reports a destination that is not a regular file as a structured AdapterError", async () => {
    const fs: AdapterFs = {
      async readBounded(): Promise<BoundedReadOutcome> {
        return { kind: "not-a-file" };
      },
      async writeFileAtomic(): Promise<void> {},
    };
    const error = await readError(
      createResxAdapter(fs).write(resource([entry("A", "x")]), "Resources.resx"),
    );
    expect((error as AdapterError).code).toBe("INVALID_STRUCTURE");
  });

  it("reports an unreadable destination as a structured AdapterError", async () => {
    const fs: AdapterFs = {
      async readBounded(): Promise<BoundedReadOutcome> {
        throw Object.assign(new Error("EACCES"), { code: "EACCES" });
      },
      async writeFileAtomic(): Promise<void> {},
    };
    const error = await readError(
      createResxAdapter(fs).write(resource([entry("A", "x")]), "Resources.resx"),
    );
    expect(error).toBeInstanceOf(AdapterError);
    expect((error as AdapterError).code).toBe("INVALID_STRUCTURE");
  });
});
