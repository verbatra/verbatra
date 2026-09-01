import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { LocaleResource, TranslationEntry } from "@verbatra/core";
import { describe, expect, it } from "vitest";
import { AdapterError } from "../errors.js";
import { MAX_INPUT_BYTES } from "../json/limits.js";
import { createAndroidXmlAdapter } from "./android-xml-adapter.js";

const adapter = createAndroidXmlAdapter();

async function tempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "verbatra-android-xml-"));
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

function errorCode(error: unknown): string | undefined {
  return error instanceof AdapterError ? error.code : undefined;
}

const BASIC = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">My App</string>
    <string name="greeting">Hello, %1$s! You have %2$d messages.</string>
</resources>
`;

describe("createAndroidXmlAdapter detection", () => {
  it("handles .xml only", () => {
    expect(adapter.canHandle("strings.xml")).toBe(true);
    expect(adapter.canHandle("strings.json")).toBe(false);
  });

  it("does not sniff content, only the extension matters", () => {
    expect(adapter.canHandle("strings.xml", "not xml at all")).toBe(true);
  });

  it("reports format android-xml", () => {
    expect(adapter.format).toBe("android-xml");
  });
});

describe("createAndroidXmlAdapter read: strings and plurals", () => {
  it("reads plain strings", async () => {
    const { resource } = await adapter.read(await tempFile("strings.xml", BASIC), "en");
    expect(resource.entries.get("app_name")?.value).toBe("My App");
    expect(resource.entries.get("greeting")?.value).toBe("Hello, %1$s! You have %2$d messages.");
  });

  it("extracts positional printf placeholders", async () => {
    const { resource } = await adapter.read(await tempFile("strings.xml", BASIC), "en");
    expect(resource.entries.get("greeting")?.placeholders).toEqual(["%1$s", "%2$d"]);
  });

  it("reads plurals into bracketed keys, one entry per quantity", async () => {
    const doc = `<resources><plurals name="count"><item quantity="one">%d song</item><item quantity="other">%d songs</item></plurals></resources>`;
    const { resource } = await adapter.read(await tempFile("p.xml", doc), "en");
    expect(resource.entries.get("count[one]")?.value).toBe("%d song");
    expect(resource.entries.get("count[other]")?.value).toBe("%d songs");
    expect(resource.entries.get("count[one]")?.isPlural).toBe(true);
    expect(resource.entries.size).toBe(2);
  });

  it("round-trips a locale that supplies only some plural categories", async () => {
    const doc = `<resources><plurals name="count"><item quantity="one">1</item><item quantity="other">many</item></plurals></resources>`;
    const { resource } = await adapter.read(await tempFile("p.xml", doc), "en");
    expect([...resource.entries.keys()]).toEqual(["count[one]", "count[other]"]);
  });

  it("reads an empty string element as an empty translatable value", async () => {
    const doc = `<resources><string name="empty"></string><string name="selfclose"/></resources>`;
    const { resource } = await adapter.read(await tempFile("e.xml", doc), "en");
    expect(resource.entries.get("empty")?.value).toBe("");
    expect(resource.entries.get("selfclose")?.value).toBe("");
  });

  it('translates a formatted="false" string normally', async () => {
    const doc = `<resources><string name="raw" formatted="false">50%% off</string></resources>`;
    const { resource } = await adapter.read(await tempFile("f.xml", doc), "en");
    expect(resource.entries.get("raw")?.value).toBe("50%% off");
    expect(resource.entries.get("raw")?.placeholders).toEqual(["%%"]);
  });
});

describe("createAndroidXmlAdapter read: translatable=false and read-through nodes", () => {
  it('excludes a translatable="false" string from entries', async () => {
    const doc = `<resources><string name="app_id" translatable="false">com.example.app</string><string name="ok">OK</string></resources>`;
    const { resource } = await adapter.read(await tempFile("t.xml", doc), "en");
    expect(resource.entries.has("app_id")).toBe(false);
    expect(resource.entries.get("ok")?.value).toBe("OK");
  });

  it('excludes a translatable="false" plurals block from entries', async () => {
    const doc = `<resources><plurals name="count" translatable="false"><item quantity="one">x</item><item quantity="other">y</item></plurals></resources>`;
    const { resource } = await adapter.read(await tempFile("t.xml", doc), "en");
    expect(resource.entries.size).toBe(0);
  });

  it("excludes a string-array from entries entirely", async () => {
    const doc = `<resources><string-array name="planets"><item>Mercury</item><item>Venus</item></string-array><string name="ok">OK</string></resources>`;
    const { resource } = await adapter.read(await tempFile("a.xml", doc), "en");
    expect(resource.entries.size).toBe(1);
    expect(resource.entries.get("ok")?.value).toBe("OK");
  });

  it("excludes a string carrying inline markup from entries", async () => {
    const doc = `<resources><string name="rich">Hello <b>world</b></string></resources>`;
    const { resource } = await adapter.read(await tempFile("m.xml", doc), "en");
    expect(resource.entries.size).toBe(0);
  });

  it("excludes a string carrying a CDATA section from entries", async () => {
    const doc = `<resources><string name="c">plain <![CDATA[cdata]]></string></resources>`;
    const { resource } = await adapter.read(await tempFile("c.xml", doc), "en");
    expect(resource.entries.size).toBe(0);
  });

  it("excludes a plurals block when any item carries inline markup", async () => {
    const doc = `<resources><plurals name="count"><item quantity="one"><b>1</b></item><item quantity="other">many</item></plurals></resources>`;
    const { resource } = await adapter.read(await tempFile("pm.xml", doc), "en");
    expect(resource.entries.size).toBe(0);
  });
});

describe("createAndroidXmlAdapter read: escaping", () => {
  it("decodes an escaped apostrophe and double quote", async () => {
    const doc = `<resources><string name="a">Don\\'t say \\"hi\\"</string></resources>`;
    const { resource } = await adapter.read(await tempFile("e.xml", doc), "en");
    expect(resource.entries.get("a")?.value).toBe('Don\'t say "hi"');
  });

  it("decodes a newline and tab escape", async () => {
    const doc = `<resources><string name="a">line1\\nline2\\tindented</string></resources>`;
    const { resource } = await adapter.read(await tempFile("e.xml", doc), "en");
    expect(resource.entries.get("a")?.value).toBe("line1\nline2\tindented");
  });

  it("decodes a leading escaped @ and ? without breaking the reference-lookalike text", async () => {
    const doc = `<resources><string name="a">\\@string/not_a_ref</string><string name="b">\\?attr/also_not</string></resources>`;
    const { resource } = await adapter.read(await tempFile("e.xml", doc), "en");
    expect(resource.entries.get("a")?.value).toBe("@string/not_a_ref");
    expect(resource.entries.get("b")?.value).toBe("?attr/also_not");
  });

  it("decodes an XML entity through the normal XML text mechanism, independent of backslash escapes", async () => {
    const doc = `<resources><string name="a">Rock &amp; Roll &lt;3&gt;</string></resources>`;
    const { resource } = await adapter.read(await tempFile("e.xml", doc), "en");
    expect(resource.entries.get("a")?.value).toBe("Rock & Roll <3>");
  });
});

describe("createAndroidXmlAdapter read: malformed and hostile input", () => {
  it("rejects malformed XML as INVALID_XML", async () => {
    const error = await readError(
      adapter.read(await tempFile("bad.xml", '<resources><string name="a">'), "en"),
    );
    expect(errorCode(error)).toBe("INVALID_XML");
  });

  it("names the underlying parse failure in the INVALID_XML message", async () => {
    const error = await readError(
      adapter.read(await tempFile("bad.xml", '<resources><string name="a">'), "en"),
    );
    expect((error as Error).message.length).toBeGreaterThan("The file is not valid XML.".length);
  });

  it("rejects a well-formed non-resources root as INVALID_STRUCTURE", async () => {
    const error = await readError(
      adapter.read(await tempFile("r.xml", "<root><a>1</a></root>"), "en"),
    );
    expect(errorCode(error)).toBe("INVALID_STRUCTURE");
  });

  it("rejects a DOCTYPE declaration as INVALID_XML before parsing", async () => {
    const doc = `<?xml version="1.0"?>\n<!DOCTYPE resources [<!ELEMENT resources ANY>]>\n<resources><string name="a">A</string></resources>`;
    const error = await readError(adapter.read(await tempFile("dtd.xml", doc), "en"));
    expect(errorCode(error)).toBe("INVALID_XML");
  });

  it("rejects an ENTITY declaration as INVALID_XML before parsing", async () => {
    const doc = `<?xml version="1.0"?>\n<!DOCTYPE resources [<!ENTITY xxe "payload">]>\n<resources><string name="a">&xxe;</string></resources>`;
    const error = await readError(adapter.read(await tempFile("ent.xml", doc), "en"));
    expect(errorCode(error)).toBe("INVALID_XML");
  });

  it("rejects an undeclared namespace prefix as INVALID_XML rather than an unstructured throw", async () => {
    const doc = `<resources><foo:bar name="a">x</foo:bar></resources>`;
    const error = await readError(adapter.read(await tempFile("ns.xml", doc), "en"));
    expect(errorCode(error)).toBe("INVALID_XML");
  });

  it("rejects a resource name that is not a valid Android identifier", async () => {
    const doc = `<resources><string name="2bad">x</string></resources>`;
    const error = await readError(adapter.read(await tempFile("n.xml", doc), "en"));
    expect(errorCode(error)).toBe("INVALID_STRUCTURE");
    expect((error as Error).message).toContain("2bad");
  });

  it("rejects a plurals item with an unsupported quantity", async () => {
    const doc = `<resources><plurals name="count"><item quantity="dozen">x</item></plurals></resources>`;
    const error = await readError(adapter.read(await tempFile("q.xml", doc), "en"));
    expect(errorCode(error)).toBe("INVALID_STRUCTURE");
    expect((error as Error).message).toContain("dozen");
    expect((error as Error).message).toContain("count");
  });

  it("rejects two items in the same plurals sharing a quantity", async () => {
    const doc = `<resources><plurals name="count"><item quantity="one">a</item><item quantity="one">b</item></plurals></resources>`;
    const error = await readError(adapter.read(await tempFile("dq.xml", doc), "en"));
    expect(errorCode(error)).toBe("INVALID_STRUCTURE");
  });

  it("rejects two strings resolving to the same key", async () => {
    const doc = `<resources><string name="dup">a</string><string name="dup">b</string></resources>`;
    const error = await readError(adapter.read(await tempFile("ds.xml", doc), "en"));
    expect(errorCode(error)).toBe("INVALID_STRUCTURE");
  });

  it("rejects a <string> with no name attribute", async () => {
    const doc = `<resources><string>no name</string></resources>`;
    const error = await readError(adapter.read(await tempFile("nn.xml", doc), "en"));
    expect(errorCode(error)).toBe("INVALID_STRUCTURE");
  });

  it("rejects a <plurals> with no name attribute", async () => {
    const doc = `<resources><plurals><item quantity="one">a</item></plurals></resources>`;
    const error = await readError(adapter.read(await tempFile("pnn.xml", doc), "en"));
    expect(errorCode(error)).toBe("INVALID_STRUCTURE");
  });

  it("rejects a plurals item with no quantity attribute", async () => {
    const doc = `<resources><plurals name="count"><item>a</item></plurals></resources>`;
    const error = await readError(adapter.read(await tempFile("nq.xml", doc), "en"));
    expect(errorCode(error)).toBe("INVALID_STRUCTURE");
  });

  it("rejects a bracket-shaped name colliding with a real plurals resolved key", async () => {
    const doc = `<resources><plurals name="count"><item quantity="one">a</item></plurals><string name="count[one]">b</string></resources>`;
    const error = await readError(adapter.read(await tempFile("collide.xml", doc), "en"));
    expect(errorCode(error)).toBe("INVALID_STRUCTURE");
  });

  it("rejects oversized input with INPUT_TOO_LARGE", async () => {
    const path = await tempBinaryFile("big.xml", new Uint8Array(MAX_INPUT_BYTES + 1));
    const error = await readError(adapter.read(path, "en"));
    expect(errorCode(error)).toBe("INPUT_TOO_LARGE");
  });
});

describe("createAndroidXmlAdapter write: semantic round-trip", () => {
  it("preserves element order, attributes, and comments when nothing changed", async () => {
    const source = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <!-- app name -->
    <string name="app_name">My App</string>
    <string name="ok" formatted="false">OK</string>
</resources>
`;
    const path = await tempFile("s.xml", source);
    const { resource } = await adapter.read(path, "en");
    await adapter.write(resource, path);
    const written = await readFile(path, "utf8");
    expect(written).toContain("<!-- app name -->");
    expect(written).toContain('formatted="false"');
    const reread = await adapter.read(path, "en");
    expect([...reread.resource.entries.keys()]).toEqual(["app_name", "ok"]);
    expect(reread.resource.entries.get("app_name")?.value).toBe("My App");
  });

  it("updates a translated value in place, re-escaping it", async () => {
    const path = await tempFile("t.xml", BASIC);
    const { resource } = await adapter.read(path, "en");
    const entries = new Map(resource.entries);
    entries.set("app_name", {
      ...(entries.get("app_name") as TranslationEntry),
      value: `Mi App "Genial"`,
    });
    await adapter.write({ ...resource, entries }, path);
    const written = await readFile(path, "utf8");
    expect(written).toContain('Mi App \\"Genial\\"');
    const reread = await adapter.read(path, "en");
    expect(reread.resource.entries.get("app_name")?.value).toBe('Mi App "Genial"');
  });

  it("prunes a key removed from entries from the destination", async () => {
    const path = await tempFile("p.xml", BASIC);
    const { resource } = await adapter.read(path, "en");
    const entries = new Map(resource.entries);
    entries.delete("greeting");
    await adapter.write({ ...resource, entries }, path);
    const written = await readFile(path, "utf8");
    expect(written).not.toContain("greeting");
    expect(written).toContain("app_name");
  });

  it("appends a new key from entries that the destination does not yet have", async () => {
    const path = await tempFile("n.xml", BASIC);
    const { resource } = await adapter.read(path, "en");
    const entries = new Map(resource.entries);
    entries.set("new_key", {
      key: "new_key",
      namespace: resource.namespace,
      value: "Fresh",
      placeholders: [],
      isPlural: false,
    });
    await adapter.write({ ...resource, entries }, path);
    const reread = await adapter.read(path, "en");
    expect(reread.resource.entries.get("new_key")?.value).toBe("Fresh");
  });

  it('keeps a translatable="false" entry unchanged and out of the write', async () => {
    const doc = `<resources><string name="app_id" translatable="false">com.example.app</string><string name="ok">OK</string></resources>`;
    const path = await tempFile("tf.xml", doc);
    const { resource } = await adapter.read(path, "en");
    await adapter.write(resource, path);
    const written = await readFile(path, "utf8");
    expect(written).toContain('translatable="false"');
    expect(written).toContain("com.example.app");
  });

  it('keeps a translatable="false" plurals block unchanged and out of the write', async () => {
    const doc = `<resources><plurals name="count" translatable="false"><item quantity="one">a</item><item quantity="other">b</item></plurals></resources>`;
    const path = await tempFile("tfp.xml", doc);
    const { resource } = await adapter.read(path, "en");
    await adapter.write(resource, path);
    const written = await readFile(path, "utf8");
    expect(written).toContain('translatable="false"');
    expect(written).toContain('quantity="one">a<');
    expect(written).toContain('quantity="other">b<');
  });

  it("keeps a plurals block with inline markup unchanged on write", async () => {
    const doc = `<resources><plurals name="count"><item quantity="one"><b>1</b></item><item quantity="other">many</item></plurals></resources>`;
    const path = await tempFile("mp.xml", doc);
    const { resource } = await adapter.read(path, "en");
    await adapter.write(resource, path);
    const written = await readFile(path, "utf8");
    expect(written).toContain("<b>1</b>");
  });

  it("keeps a string-array unchanged and never lets it drive a write decision", async () => {
    const doc = `<resources><string-array name="planets"><item>Mercury</item><item>Venus</item></string-array><string name="ok">OK</string></resources>`;
    const path = await tempFile("sa.xml", doc);
    const { resource } = await adapter.read(path, "en");
    await adapter.write(resource, path);
    const written = await readFile(path, "utf8");
    expect(written).toContain("<string-array");
    expect(written).toContain("Mercury");
    expect(written).toContain("Venus");
  });

  it("keeps a string carrying inline markup unchanged", async () => {
    const doc = `<resources><string name="rich">Hello <b>world</b></string></resources>`;
    const path = await tempFile("m.xml", doc);
    const { resource } = await adapter.read(path, "en");
    await adapter.write(resource, path);
    const written = await readFile(path, "utf8");
    expect(written).toContain("<b>world</b>");
  });

  it("updates matched plural quantities and appends a quantity newly present in entries", async () => {
    const doc = `<resources><plurals name="count"><item quantity="one">%d song</item><item quantity="other">%d songs</item></plurals></resources>`;
    const path = await tempFile("pl.xml", doc);
    const { resource } = await adapter.read(path, "en");
    const entries = new Map(resource.entries);
    entries.set("count[one]", {
      ...(entries.get("count[one]") as TranslationEntry),
      value: "%d Lied",
    });
    entries.set("count[few]", {
      key: "count[few]",
      namespace: resource.namespace,
      value: "%d Lieder (few)",
      placeholders: ["%d"],
      isPlural: true,
    });
    await adapter.write({ ...resource, entries }, path);
    const reread = await adapter.read(path, "en");
    expect(reread.resource.entries.get("count[one]")?.value).toBe("%d Lied");
    expect(reread.resource.entries.get("count[few]")?.value).toBe("%d Lieder (few)");
    expect(reread.resource.entries.get("count[other]")?.value).toBe("%d songs");
  });

  it("prunes a plural quantity no longer present in entries and removes the whole plurals when empty", async () => {
    const doc = `<resources><plurals name="count"><item quantity="one">a</item></plurals></resources>`;
    const path = await tempFile("pe.xml", doc);
    const { resource } = await adapter.read(path, "en");
    const entries = new Map(resource.entries);
    entries.delete("count[one]");
    await adapter.write({ ...resource, entries }, path);
    const written = await readFile(path, "utf8");
    expect(written).not.toContain("<plurals");
  });

  it("prunes one quantity from a plurals block while the block itself stays translatable", async () => {
    const doc = `<resources><plurals name="count"><item quantity="one">a</item><item quantity="other">b</item></plurals></resources>`;
    const path = await tempFile("pp.xml", doc);
    const { resource } = await adapter.read(path, "en");
    const entries = new Map(resource.entries);
    entries.delete("count[other]");
    await adapter.write({ ...resource, entries }, path);
    const written = await readFile(path, "utf8");
    expect(written).toContain('quantity="one"');
    expect(written).not.toContain('quantity="other"');
    const reread = await adapter.read(path, "en");
    expect([...reread.resource.entries.keys()]).toEqual(["count[one]"]);
  });
});

describe("createAndroidXmlAdapter write: entries always wins over a stale destination shape", () => {
  it('overwrites a destination string that is still marked translatable="false" once its key is in entries', async () => {
    const doc = `<resources><string name="app_id" translatable="false">stale</string></resources>`;
    const path = await tempFile("promote.xml", doc);
    const entries = new Map<string, TranslationEntry>([
      [
        "app_id",
        {
          key: "app_id",
          namespace: "promote",
          value: "Fresh Value",
          placeholders: [],
          isPlural: false,
        },
      ],
    ]);
    const resource: LocaleResource = {
      locale: "en",
      namespace: "promote",
      format: "android-xml",
      entries,
    };
    await adapter.write(resource, path);
    const written = await readFile(path, "utf8");
    expect(written).not.toContain('translatable="false"');
    expect(written).toContain("Fresh Value");
    const reread = await adapter.read(path, "en");
    expect(reread.resource.entries.get("app_id")?.value).toBe("Fresh Value");
  });
});

describe("createAndroidXmlAdapter write: documented limitation (demotion to read-through, pruned only on a --prune run)", () => {
  it("removes a previously translated key that the caller omits from entries, rather than preserving it (documented v1 limitation)", async () => {
    const doc = `<resources><string name="app_id">Was Translated</string></resources>`;
    const path = await tempFile("demote.xml", doc);
    const { resource } = await adapter.read(path, "en");
    const entries = new Map(resource.entries);
    entries.delete("app_id");
    await adapter.write({ ...resource, entries }, path);
    const written = await readFile(path, "utf8");
    expect(written).not.toContain("Was Translated");
    expect(written).not.toContain("app_id");
  });
});

describe("createAndroidXmlAdapter write: injection safety", () => {
  it("round-trips a value containing a raw closing/opening tag sequence as literal text", async () => {
    const path = await tempFile("inj.xml", BASIC);
    const { resource } = await adapter.read(path, "en");
    const entries = new Map(resource.entries);
    entries.set("app_name", {
      ...(entries.get("app_name") as TranslationEntry),
      value: '</string><string name="evil">HACKED',
    });
    await adapter.write({ ...resource, entries }, path);
    const written = await readFile(path, "utf8");
    expect(written).not.toContain('<string name="evil">');
    const reread = await adapter.read(path, "en");
    expect(reread.resource.entries.get("app_name")?.value).toBe(
      '</string><string name="evil">HACKED',
    );
  });

  it("round-trips a name attribute containing a quote as a single literal attribute value", async () => {
    const path = await tempFile("inj2.xml", "<resources></resources>");
    const name = 'greeting" foo="bar';
    const entries = new Map<string, TranslationEntry>([
      [name, { key: name, namespace: "inj2", value: "x", placeholders: [], isPlural: false }],
    ]);
    const resource: LocaleResource = {
      locale: "en",
      namespace: "inj2",
      format: "android-xml",
      entries,
    };
    await adapter.write(resource, path);
    const written = await readFile(path, "utf8");
    expect(written).not.toContain(' foo="bar"');
    expect(written).toContain('name="greeting&quot; foo=&quot;bar"');
  });
});

describe("createAndroidXmlAdapter write: synthesizing a missing destination", () => {
  it("creates the parent directory and a well-formed document with an XML declaration", async () => {
    const source = await tempFile("strings.xml", BASIC);
    const { resource } = await adapter.read(source, "en");
    const dest = join(await tempDir(), "values-de", "strings.xml");
    await adapter.write(resource, dest);
    const written = await readFile(dest, "utf8");
    expect(written.startsWith('<?xml version="1.0" encoding="utf-8"?>')).toBe(true);
    expect(written).toContain("<resources>");
    const reread = await adapter.read(dest, "de");
    expect(reread.resource.entries.get("app_name")?.value).toBe("My App");
  });

  it("writes exactly the quantities present in entries, inventing no CLDR forms", async () => {
    const dir = await tempDir();
    const entries = new Map<string, TranslationEntry>([
      [
        "count[one]",
        {
          key: "count[one]",
          namespace: "n",
          value: "%d song",
          placeholders: ["%d"],
          isPlural: true,
        },
      ],
      [
        "count[other]",
        {
          key: "count[other]",
          namespace: "n",
          value: "%d songs",
          placeholders: ["%d"],
          isPlural: true,
        },
      ],
    ]);
    const resource: LocaleResource = {
      locale: "en",
      namespace: "n",
      format: "android-xml",
      entries,
    };
    const dest = join(dir, "values", "strings.xml");
    await adapter.write(resource, dest);
    const reread = await adapter.read(dest, "en");
    expect([...reread.resource.entries.keys()].sort()).toEqual(["count[one]", "count[other]"]);
  });

  it("rejects oversized destination input with INPUT_TOO_LARGE", async () => {
    const path = await tempBinaryFile("bigdest.xml", new Uint8Array(MAX_INPUT_BYTES + 1));
    const entries = new Map<string, TranslationEntry>([
      ["a", { key: "a", namespace: "n", value: "x", placeholders: [], isPlural: false }],
    ]);
    const resource: LocaleResource = {
      locale: "en",
      namespace: "n",
      format: "android-xml",
      entries,
    };
    const error = await readError(adapter.write(resource, path));
    expect(errorCode(error)).toBe("INPUT_TOO_LARGE");
  });
});

describe("createAndroidXmlAdapter placeholders and the space-flag trap", () => {
  it("does not extract a token from a bare percent in ordinary text", async () => {
    const doc = `<resources><string name="a">50% off</string></resources>`;
    const { resource } = await adapter.read(await tempFile("pct.xml", doc), "en");
    expect(resource.entries.get("a")?.placeholders).toEqual([]);
  });
});
