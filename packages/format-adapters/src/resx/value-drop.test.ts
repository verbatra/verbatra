import type { LocaleResource, TranslationEntry } from "@verbatra/core";
import { describe, expect, it } from "vitest";
import { AdapterError } from "../errors.js";
import { createMemoryAdapterFs, type MemoryAdapterFs } from "../test-support.js";
import { createResxAdapter } from "./resx-adapter.js";

const PATH = "Resources.de.resx";

function setup(document: string): {
  readonly adapter: ReturnType<typeof createResxAdapter>;
  readonly fs: MemoryAdapterFs;
} {
  const fs = createMemoryAdapterFs({ [PATH]: document });
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

async function caught(promise: Promise<unknown>): Promise<unknown> {
  return promise.catch((error: unknown) => error);
}

async function refusedWrite(
  document: string,
  entries: readonly TranslationEntry[],
): Promise<{ readonly error: AdapterError; readonly after: string | undefined }> {
  const { adapter, fs } = setup(document);
  const error = await caught(adapter.write(resource(entries), PATH));
  expect(error).toBeInstanceOf(AdapterError);
  return { error: error as AdapterError, after: fs.files.get(PATH) };
}

describe("createResxAdapter never swallows a translated value on a name collision", () => {
  it("refuses when the typed twin of a name comes before its plain twin", async () => {
    const document =
      '<root><data name="A" type="T"><value>1</value></data><data name="A"><value>old</value></data></root>';
    const { error, after } = await refusedWrite(document, [entry("A", "neu")]);
    expect(error.code).toBe("INVALID_STRUCTURE");
    expect(error.message).toContain("A");
    expect(after).toBe(document);
  });

  it("refuses when the plain twin of a name comes before its typed twin, so the earlier write is discarded", async () => {
    const document =
      '<root><data name="A"><value>old</value></data><data name="A" type="T"><value>1</value></data></root>';
    const { error, after } = await refusedWrite(document, [entry("A", "neu")]);
    expect(error.code).toBe("INVALID_STRUCTURE");
    expect(after).toBe(document);
    expect(after).not.toContain("neu");
  });

  it("refuses a name that is both designer-prefixed and typed", async () => {
    const document = '<root><data name="$this.Text" type="T"><value>x</value></data></root>';
    const { error, after } = await refusedWrite(document, [entry("$this.Text", "Beschriftung")]);
    expect(error.code).toBe("INVALID_STRUCTURE");
    expect(error.message).toContain("$this.Text");
    expect(after).toBe(document);
  });

  it("refuses a collision even when the translated value is the empty string", async () => {
    const document = '<root><data name="A" type="System.Int32"><value>5</value></data></root>';
    const { error, after } = await refusedWrite(document, [entry("A", "")]);
    expect(error.code).toBe("INVALID_STRUCTURE");
    expect(after).toBe(document);
  });

  it("refuses a collision on a mimetype-only destination entry, not just a typed one", async () => {
    const document =
      '<root><data name="A" mimetype="application/x-microsoft.net.object.binary.base64"><value>b</value></data></root>';
    const { error, after } = await refusedWrite(document, [entry("A", "neu")]);
    expect(error.code).toBe("INVALID_STRUCTURE");
    expect(after).toBe(document);
    expect(after).toContain("<value>b</value>");
  });

  it("refuses a collision on a type-only destination entry", async () => {
    const document = '<root><data name="A" type="System.Int32"><value>5</value></data></root>';
    const { error } = await refusedWrite(document, [entry("A", "neu")]);
    expect(error.code).toBe("INVALID_STRUCTURE");
  });
});

describe("createResxAdapter treats a resx name as case-sensitive", () => {
  it("does not treat a name differing only by case as a collision", async () => {
    const { adapter, fs } = setup('<root><data name="Greeting"><value>old</value></data></root>');
    await adapter.write(resource([entry("greeting", "neu")]), PATH);
    const written = fs.files.get(PATH) ?? "";
    expect(written).toContain('name="greeting"');
    expect(written).toContain("neu");
    expect(written).not.toContain('name="Greeting"');
    expect(written).not.toContain("old");
  });

  it("still refuses when the case matches exactly and the destination entry is typed", async () => {
    const document = '<root><data name="Greeting" type="T"><value>old</value></data></root>';
    const { error } = await refusedWrite(document, [entry("Greeting", "neu")]);
    expect(error.code).toBe("INVALID_STRUCTURE");
  });
});

describe("createResxAdapter preserves an untranslatable destination entry with no competitor", () => {
  it("leaves a typed entry in place when no entry carries its name", async () => {
    const document =
      '<root><data name="Logo" type="System.Drawing.Bitmap"><value>iVBOR</value></data></root>';
    const { adapter, fs } = setup(document);
    await adapter.write(resource([]), PATH);
    expect(fs.files.get(PATH)).toBe(document);
  });

  it("leaves a data element with an empty name attribute untouched while writing its neighbour", async () => {
    const { adapter, fs } = setup(
      '<root><data name=""><value>x</value></data><data name="B"><value>y</value></data></root>',
    );
    await adapter.write(resource([entry("B", "z")]), PATH);
    expect(fs.files.get(PATH)).toBe(
      '<root><data name=""><value>x</value></data><data name="B"><value>z</value></data></root>',
    );
  });

  it("leaves a data element with no name attribute at all untouched", async () => {
    const { adapter, fs } = setup(
      '<root><data><value>x</value></data><data name="B"><value>y</value></data></root>',
    );
    const written = await adapter
      .write(resource([entry("B", "z")]), PATH)
      .then(() => fs.files.get(PATH));
    expect(written).toContain("<data><value>x</value></data>");
  });
});

describe("createResxAdapter append path has no name guard (known gap)", () => {
  it("writes a designer-shaped name it can never read back, then refuses every later write that still carries it", async () => {
    const { adapter, fs } = setup("<root></root>");
    await adapter.write(resource([entry("$this.Text", "neu"), entry("Ok", "OK")]), PATH);
    const written = fs.files.get(PATH) ?? "";
    expect(written).toContain('name="$this.Text"');
    expect(written).toContain("neu");

    const { resource: back } = await adapter.read(PATH, "de");
    expect([...back.entries.keys()]).toEqual(["Ok"]);

    const error = await caught(
      adapter.write(resource([entry("$this.Text", "neuer"), entry("Ok", "OK")]), PATH),
    );
    expect(error).toBeInstanceOf(AdapterError);
    expect((error as AdapterError).code).toBe("INVALID_STRUCTURE");
    expect(fs.files.get(PATH)).toBe(written);
  });

  it("escapes an angle-bracket designer prefix into the name attribute rather than rejecting it", async () => {
    const { adapter, fs } = setup("<root></root>");
    await adapter.write(resource([entry(">>x.Name", "neu")]), PATH);
    expect(fs.files.get(PATH)).toContain('name="&gt;&gt;x.Name"');
    const { resource: back } = await adapter.read(PATH, "de");
    expect([...back.entries.keys()]).toEqual([]);
  });
});
