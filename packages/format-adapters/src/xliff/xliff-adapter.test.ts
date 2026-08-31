import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { LocaleResource, TranslationEntry } from "@verbatra/core";
import { describe, expect, it } from "vitest";
import { AdapterError } from "../errors.js";
import type { AdapterFs } from "../fs-port.js";
import { createXliffAdapter } from "./xliff-adapter.js";

const adapter = createXliffAdapter();

const XLIFF_12 = `<?xml version="1.0" encoding="UTF-8"?>
<xliff version="1.2"><file source-language="en" target-language="de" datatype="plaintext"><body>
<trans-unit id="greeting" resname="greet"><source>Hello <x id="1"/></source><note priority="1">be friendly</note></trans-unit>
<trans-unit id="bye"><source>Bye</source><target>Tschuess</target></trans-unit>
</body></file></xliff>`;

const XLIFF_20 = `<?xml version="1.0" encoding="UTF-8"?>
<xliff version="2.0" srcLang="en" trgLang="fr"><file id="f1"><unit id="u1"><segment><source>Hello {name}</source><target>Bonjour {name}</target></segment></unit></file></xliff>`;

const XLIFF_20_WITH_NOTE = `<?xml version="1.0" encoding="UTF-8"?>
<xliff version="2.0" srcLang="en" trgLang="fr"><file id="f1"><unit id="u1"><notes><note category="description">be friendly</note></notes><segment><source>Hi {name}</source></segment></unit></file></xliff>`;

const XLIFF_12_NAMESPACED = `<?xml version="1.0" encoding="UTF-8"?>
<xliff xmlns="urn:oasis:names:tc:xliff:document:1.2" version="1.2"><file source-language="en" target-language="de"><body>
<trans-unit id="g1"><source>Hi <g id="1">there</g></source></trans-unit>
</body></file></xliff>`;

async function tempFile(name: string, content: string): Promise<string> {
  const path = join(await mkdtemp(join(tmpdir(), "verbatra-xliff-")), name);
  await writeFile(path, content);
  return path;
}

async function readError(promise: Promise<unknown>): Promise<unknown> {
  return promise.catch((error: unknown) => error);
}

describe("createXliffAdapter detection", () => {
  it("handles .xlf and .xliff", () => {
    expect(adapter.canHandle("messages.xlf")).toBe(true);
    expect(adapter.canHandle("messages.xliff")).toBe(true);
    expect(adapter.canHandle("messages.json")).toBe(false);
  });

  it("sniffs a leading <xliff or <?xml token", () => {
    expect(adapter.canHandle("messages.xlf", '<?xml version="1.0"?>')).toBe(true);
    expect(adapter.canHandle("messages.xlf", '<xliff version="1.2">')).toBe(true);
    expect(adapter.canHandle("messages.xlf", "not xml")).toBe(false);
  });

  it("reports format xliff", () => {
    expect(adapter.format).toBe("xliff");
  });
});

describe("createXliffAdapter read", () => {
  it("parses XLIFF 1.2, reading source when no target and target when present", async () => {
    const { resource } = await adapter.read(await tempFile("m.xlf", XLIFF_12), "de");
    expect(resource.entries.get("greeting")?.value).toBe('Hello <x id="1"/>');
    expect(resource.entries.get("bye")?.value).toBe("Tschuess");
  });

  it("extracts inline placeholder ids", async () => {
    const { resource } = await adapter.read(await tempFile("m.xlf", XLIFF_12), "de");
    expect(resource.entries.get("greeting")?.placeholders).toEqual(['<x id="1"/>']);
  });

  it("populates entry.description from a 1.2 trans-unit's <note>", async () => {
    const { resource } = await adapter.read(await tempFile("m.xlf", XLIFF_12), "de");
    expect(resource.entries.get("greeting")?.description).toBe("be friendly");
    expect(resource.entries.get("bye")?.description).toBeUndefined();
  });

  it("populates entry.description from a 2.0 unit's <notes><note>, shared by every segment in the unit", async () => {
    const { resource } = await adapter.read(await tempFile("m.xliff", XLIFF_20_WITH_NOTE), "fr");
    expect(resource.entries.get("u1")?.description).toBe("be friendly");
  });

  it("leaves description undefined for a 2.0 unit with no <notes>", async () => {
    const { resource } = await adapter.read(await tempFile("m.xliff", XLIFF_20), "fr");
    expect(resource.entries.get("u1")?.description).toBeUndefined();
  });

  it("parses XLIFF 2.0 unit/segment, preferring the target", async () => {
    const { resource } = await adapter.read(await tempFile("m.xliff", XLIFF_20), "fr");
    expect(resource.entries.get("u1")?.value).toBe("Bonjour {name}");
    expect(resource.entries.get("u1")?.placeholders).toEqual(["{name}"]);
  });

  it("reports malformed XML as INVALID_XML", async () => {
    const error = await readError(
      adapter.read(await tempFile("bad.xlf", "<xliff><file><body><trans-unit>"), "de"),
    );
    expect((error as AdapterError).code).toBe("INVALID_XML");
  });

  it("rejects a well-formed non-XLIFF document as INVALID_STRUCTURE", async () => {
    const error = await readError(
      adapter.read(await tempFile("other.xlf", "<root><a>1</a></root>"), "de"),
    );
    expect((error as AdapterError).code).toBe("INVALID_STRUCTURE");
  });

  it("rejects XLIFF declaring a DOCTYPE as INVALID_XML before parsing", async () => {
    const doc = `<?xml version="1.0"?>
<!DOCTYPE xliff [<!ELEMENT xliff ANY>]>
<xliff version="1.2"><file><body><trans-unit id="a"><source>A</source></trans-unit></body></file></xliff>`;
    const error = await readError(adapter.read(await tempFile("dtd.xlf", doc), "de"));
    expect((error as AdapterError).code).toBe("INVALID_XML");
  });

  it("rejects XLIFF declaring an ENTITY as INVALID_XML before parsing", async () => {
    const doc = `<?xml version="1.0"?>
<!DOCTYPE xliff [<!ENTITY xxe "payload">]>
<xliff version="1.2"><file><body><trans-unit id="a"><source>&xxe;</source></trans-unit></body></file></xliff>`;
    const error = await readError(adapter.read(await tempFile("ent.xlf", doc), "de"));
    expect((error as AdapterError).code).toBe("INVALID_XML");
  });

  it("rejects a lone ENTITY declaration regardless of letter case", async () => {
    const doc = `<!doctype xliff [<!entity x "y">]><xliff version="1.2"><file><body><trans-unit id="a"><source>A</source></trans-unit></body></file></xliff>`;
    const error = await readError(adapter.read(await tempFile("lc.xlf", doc), "de"));
    expect((error as AdapterError).code).toBe("INVALID_XML");
  });

  it("rejects two trans-units sharing the same id as INVALID_STRUCTURE", async () => {
    const doc = `<xliff version="1.2"><file><body><trans-unit id="dup"><source>A</source></trans-unit><trans-unit id="dup"><source>B</source></trans-unit></body></file></xliff>`;
    const error = await readError(adapter.read(await tempFile("dup.xlf", doc), "de"));
    expect((error as AdapterError).code).toBe("INVALID_STRUCTURE");
  });

  it("rejects two 2.0 units sharing the same id as INVALID_STRUCTURE", async () => {
    const doc = `<xliff version="2.0"><file id="f"><unit id="dup"><segment><source>A</source></segment></unit><unit id="dup"><segment><source>B</source></segment></unit></file></xliff>`;
    const error = await readError(adapter.read(await tempFile("dup2.xliff", doc), "de"));
    expect((error as AdapterError).code).toBe("INVALID_STRUCTURE");
  });

  it("rejects a synthesized positional key colliding with a real id as INVALID_STRUCTURE", async () => {
    const doc = `<xliff version="1.2"><file><body><trans-unit><source>A</source></trans-unit><trans-unit id="unit-0"><source>B</source></trans-unit></body></file></xliff>`;
    const error = await readError(adapter.read(await tempFile("collide.xlf", doc), "de"));
    expect((error as AdapterError).code).toBe("INVALID_STRUCTURE");
  });

  it("documents the positional fallback's instability: inserting an id-less unit shifts every later synthesized key", async () => {
    const before = `<xliff version="1.2"><file><body><trans-unit><source>Z</source></trans-unit></body></file></xliff>`;
    const after = `<xliff version="1.2"><file><body><trans-unit><source>Y</source></trans-unit><trans-unit><source>Z</source></trans-unit></body></file></xliff>`;
    const beforeRead = await adapter.read(await tempFile("shift-before.xlf", before), "de");
    const afterRead = await adapter.read(await tempFile("shift-after.xlf", after), "de");
    expect(beforeRead.resource.entries.get("unit-0")?.value).toBe("Z");
    expect(afterRead.resource.entries.get("unit-0")?.value).toBe("Y");
    expect(afterRead.resource.entries.get("unit-1")?.value).toBe("Z");
  });
});

describe("createXliffAdapter write (round-trip fidelity)", () => {
  it("preserves attributes and notes when writing back", async () => {
    const path = await tempFile("m.xlf", XLIFF_12);
    const { resource } = await adapter.read(path, "de");
    await adapter.write(resource, path);
    const written = await readFile(path, "utf8");
    expect(written).toContain('resname="greet"');
    expect(written).toContain('source-language="en"');
    expect(written).toContain('<note priority="1">be friendly</note>');
    const reread = await adapter.read(path, "de");
    expect(reread.resource.entries.get("bye")?.value).toBe("Tschuess");
  });

  it("creates a <target> for a unit that lacks one, seeding it from the read value", async () => {
    const path = await tempFile("m.xlf", XLIFF_12);
    const { resource } = await adapter.read(path, "de");
    await adapter.write(resource, path);
    const written = await readFile(path, "utf8");
    expect(written).toContain('<target>Hello <x id="1"/></target>');
  });

  it("writes a translated target value into an existing target", async () => {
    const path = await tempFile("m.xliff", XLIFF_20);
    const { resource } = await adapter.read(path, "fr");
    const entries = new Map(resource.entries);
    const u1 = entries.get("u1");
    if (u1) {
      entries.set("u1", { ...u1, value: "Salut {name}" });
    }
    await adapter.write({ ...resource, entries }, path);
    const reread = await adapter.read(path, "fr");
    expect(reread.resource.entries.get("u1")?.value).toBe("Salut {name}");
  });

  it("raises INVALID_STRUCTURE when the destination does not exist", async () => {
    const { resource } = await adapter.read(await tempFile("m.xlf", XLIFF_12), "de");
    const missing = join(await mkdtemp(join(tmpdir(), "verbatra-xliff-")), "absent.xlf");
    const error = await readError(adapter.write(resource, missing));
    expect((error as AdapterError).code).toBe("INVALID_STRUCTURE");
    expect((error as AdapterError).message).toMatch(/does not exist/);
  });

  it("raises INVALID_STRUCTURE with a non-misleading message when the destination cannot be read for a reason other than not existing", async () => {
    const path = await tempFile("m.xlf", XLIFF_12);
    const { resource } = await adapter.read(path, "de");
    const eacces = Object.assign(new Error("permission denied"), { code: "EACCES" });
    const brokenFs: AdapterFs = {
      readBounded: () => Promise.reject(eacces),
      writeFileAtomic: () => Promise.reject(new Error("not used")),
    };
    const brokenAdapter = createXliffAdapter(brokenFs);
    const error = await readError(brokenAdapter.write(resource, path));
    expect((error as AdapterError).code).toBe("INVALID_STRUCTURE");
    expect((error as AdapterError).message).not.toMatch(/does not exist/);
  });

  it("falls back to the source value when the target is empty", async () => {
    const doc = `<xliff version="1.2"><file><body><trans-unit id="e"><source>Src</source><target></target></trans-unit></body></file></xliff>`;
    const { resource } = await adapter.read(await tempFile("e.xlf", doc), "de");
    expect(resource.entries.get("e")?.value).toBe("Src");
  });

  it("keys by resname when there is no id, and by index when there is neither", async () => {
    const doc = `<xliff version="1.2"><file><body><trans-unit resname="rn"><source>Y</source></trans-unit><trans-unit><source>Z</source></trans-unit></body></file></xliff>`;
    const { resource } = await adapter.read(await tempFile("k.xlf", doc), "de");
    expect(resource.entries.get("rn")?.value).toBe("Y");
    expect(resource.entries.get("unit-1")?.value).toBe("Z");
  });

  it("skips a trans-unit that has no source element", async () => {
    const doc = `<xliff version="1.2"><file><body><trans-unit id="t"><target>only</target></trans-unit></body></file></xliff>`;
    const { resource } = await adapter.read(await tempFile("ns.xlf", doc), "de");
    expect(resource.entries.size).toBe(0);
  });

  it("defaults to the 1.2 walk when the root has no version attribute", async () => {
    const doc = `<xliff><file><body><trans-unit id="a"><source>A</source></trans-unit></body></file></xliff>`;
    const { resource } = await adapter.read(await tempFile("nover.xlf", doc), "de");
    expect(resource.entries.get("a")?.value).toBe("A");
  });

  it("keys each segment of a multi-segment 2.0 unit by index", async () => {
    const doc = `<xliff version="2.0"><file id="f"><unit id="u"><segment><source>One</source><target>Eins</target></segment><segment><source>Two</source><target>Zwei</target></segment></unit></file></xliff>`;
    const { resource } = await adapter.read(await tempFile("multi.xliff", doc), "de");
    expect(resource.entries.get("u#0")?.value).toBe("Eins");
    expect(resource.entries.get("u#1")?.value).toBe("Zwei");
  });

  it("skips a 2.0 segment that has no source element", async () => {
    const doc = `<xliff version="2.0"><file id="f"><unit id="u"><segment><target>NoSrc</target></segment><segment><source>S</source><target>T</target></segment></unit></file></xliff>`;
    const { resource } = await adapter.read(await tempFile("seg.xliff", doc), "de");
    expect([...resource.entries.keys()]).toEqual(["u#1"]);
    expect(resource.entries.get("u#1")?.value).toBe("T");
  });

  it("rejects empty content as a structured error", async () => {
    const error = await readError(adapter.read(await tempFile("empty.xlf", ""), "de"));
    expect(error).toBeInstanceOf(AdapterError);
  });

  it("falls back to a text node when a translated value is not well-formed XML", async () => {
    const path = await tempFile("m.xliff", XLIFF_20);
    const { resource } = await adapter.read(path, "fr");
    const entries = new Map(resource.entries);
    const u1 = entries.get("u1");
    if (u1) {
      entries.set("u1", { ...u1, value: "a < b & c" });
    }
    await adapter.write({ ...resource, entries }, path);
    const written = await readFile(path, "utf8");
    expect(written).toContain("a &lt; b &amp; c");
  });

  it("rejects a translated value declaring a DOCTYPE as INVALID_XML instead of degrading to text", async () => {
    const path = await tempFile("m.xliff", XLIFF_20);
    const { resource } = await adapter.read(path, "fr");
    const entries = new Map(resource.entries);
    const u1 = entries.get("u1");
    if (u1) {
      entries.set("u1", {
        ...u1,
        value: '<!DOCTYPE x [<!ENTITY xxe "pwn">]>&xxe;',
      });
    }
    const error = await readError(adapter.write({ ...resource, entries }, path));
    expect((error as AdapterError).code).toBe("INVALID_XML");
  });

  it("rejects a translated value declaring an ENTITY as INVALID_XML instead of degrading to text", async () => {
    const path = await tempFile("m.xliff", XLIFF_20);
    const { resource } = await adapter.read(path, "fr");
    const entries = new Map(resource.entries);
    const u1 = entries.get("u1");
    if (u1) {
      entries.set("u1", { ...u1, value: '<!ENTITY xxe "pwn">&xxe;' });
    }
    const error = await readError(adapter.write({ ...resource, entries }, path));
    expect((error as AdapterError).code).toBe("INVALID_XML");
  });

  it("degrades a translated value with a non-allow-listed element to a plain text node", async () => {
    const path = await tempFile("m.xliff", XLIFF_20);
    const { resource } = await adapter.read(path, "fr");
    const entries = new Map(resource.entries);
    const u1 = entries.get("u1");
    if (u1) {
      entries.set("u1", { ...u1, value: "<script>alert(1)</script>" });
    }
    await adapter.write({ ...resource, entries }, path);
    const written = await readFile(path, "utf8");
    expect(written).not.toContain("<script>");
    expect(written).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("keeps a translated value whose only element is on the XLIFF inline allow-list", async () => {
    const path = await tempFile("m.xliff", XLIFF_20);
    const { resource } = await adapter.read(path, "fr");
    const entries = new Map(resource.entries);
    const u1 = entries.get("u1");
    if (u1) {
      entries.set("u1", { ...u1, value: 'Bonjour <g id="1">{name}</g>' });
    }
    await adapter.write({ ...resource, entries }, path);
    const written = await readFile(path, "utf8");
    expect(written).toContain('<target>Bonjour <g id="1">{name}</g></target>');
  });

  it("degrades a value mixing an allow-listed and a disallowed element entirely to text", async () => {
    const path = await tempFile("m.xliff", XLIFF_20);
    const { resource } = await adapter.read(path, "fr");
    const entries = new Map(resource.entries);
    const u1 = entries.get("u1");
    if (u1) {
      entries.set("u1", { ...u1, value: '<x id="1"/><b>bold</b>' });
    }
    await adapter.write({ ...resource, entries }, path);
    const written = await readFile(path, "utf8");
    expect(written).not.toContain("<b>");
    expect(written).toContain(`&lt;x id="1"/&gt;&lt;b&gt;bold&lt;/b&gt;`);
  });

  it("degrades an allow-listed local name carrying an attacker-chosen namespace to text", async () => {
    const path = await tempFile("m.xliff", XLIFF_20);
    const { resource } = await adapter.read(path, "fr");
    const entries = new Map(resource.entries);
    const u1 = entries.get("u1");
    if (u1) {
      entries.set("u1", {
        ...u1,
        value: '<foo:x xmlns:foo="http://evil.example">payload</foo:x>',
      });
    }
    await adapter.write({ ...resource, entries }, path);
    const written = await readFile(path, "utf8");
    expect(written).not.toContain("<foo:x");
    expect(written).toContain('&lt;foo:x xmlns:foo="http://evil.example"&gt;payload&lt;/foo:x&gt;');
  });

  it("strips non-allow-listed attributes from an otherwise allow-listed element", async () => {
    const path = await tempFile("m.xliff", XLIFF_20);
    const { resource } = await adapter.read(path, "fr");
    const entries = new Map(resource.entries);
    const u1 = entries.get("u1");
    if (u1) {
      entries.set("u1", {
        ...u1,
        value:
          '<x id="1" onclick="alert(1)" xlink:href="javascript:alert(1)" xmlns:xlink="http://www.w3.org/1999/xlink"/>',
      });
    }
    await adapter.write({ ...resource, entries }, path);
    const written = await readFile(path, "utf8");
    expect(written).toContain('<target><x id="1"/></target>');
    expect(written).not.toContain("onclick");
    expect(written).not.toContain("xlink:href");
  });

  it("degrades a CDATA section in a translated value entirely to escaped text", async () => {
    const path = await tempFile("m.xliff", XLIFF_20);
    const { resource } = await adapter.read(path, "fr");
    const entries = new Map(resource.entries);
    const u1 = entries.get("u1");
    if (u1) {
      entries.set("u1", { ...u1, value: "<![CDATA[<script>alert(1)</script>]]>" });
    }
    await adapter.write({ ...resource, entries }, path);
    const written = await readFile(path, "utf8");
    expect(written).not.toContain("<![CDATA[");
    expect(written).not.toContain("<script>");
  });

  it("degrades a processing instruction in a translated value entirely to escaped text", async () => {
    const path = await tempFile("m.xliff", XLIFF_20);
    const { resource } = await adapter.read(path, "fr");
    const entries = new Map(resource.entries);
    const u1 = entries.get("u1");
    if (u1) {
      entries.set("u1", { ...u1, value: '<?xml-stylesheet href="evil.xsl"?>' });
    }
    await adapter.write({ ...resource, entries }, path);
    const written = await readFile(path, "utf8");
    expect(written).not.toContain("<?xml-stylesheet");
    expect(written).toContain("&lt;?xml-stylesheet");
  });

  it("keeps an inline allow-listed element live when the source document declares the XLIFF namespace", async () => {
    const path = await tempFile("ns.xlf", XLIFF_12_NAMESPACED);
    const { resource } = await adapter.read(path, "de");
    expect(resource.entries.get("g1")?.value).toBe(
      'Hi <g id="1" xmlns="urn:oasis:names:tc:xliff:document:1.2">there</g>',
    );
    await adapter.write(resource, path);
    const reread = await adapter.read(path, "de");
    expect(reread.resource.entries.get("g1")?.value).toContain("<g");
    expect(reread.resource.entries.get("g1")?.value).not.toContain("&lt;g");
  });

  it("falls back to a text node when a translated value has unbalanced inline markup", async () => {
    const path = await tempFile("m.xliff", XLIFF_20);
    const { resource } = await adapter.read(path, "fr");
    const entries = new Map(resource.entries);
    const u1 = entries.get("u1");
    if (u1) {
      entries.set("u1", { ...u1, value: '<g id="1">oops' });
    }
    await adapter.write({ ...resource, entries }, path);
    const written = await readFile(path, "utf8");
    expect(written).toContain('&lt;g id="1"&gt;oops');
  });

  it("raises INVALID_STRUCTURE when the destination path is not a regular file", async () => {
    const { resource } = await adapter.read(await tempFile("m.xlf", XLIFF_12), "de");
    const dir = await mkdtemp(join(tmpdir(), "verbatra-xliff-dir-"));
    const error = await readError(adapter.write(resource, dir));
    expect((error as AdapterError).code).toBe("INVALID_STRUCTURE");
  });

  it("ignores entries whose key matches no trans-unit", async () => {
    const path = await tempFile("m.xlf", XLIFF_12);
    const stray: TranslationEntry = {
      key: "ghost",
      namespace: "m",
      value: "boo",
      placeholders: [],
      isPlural: false,
    };
    const resource: LocaleResource = {
      locale: "de",
      namespace: "m",
      format: "xliff",
      entries: new Map([["ghost", stray]]),
    };
    await adapter.write(resource, path);
    expect(await readFile(path, "utf8")).not.toContain("boo");
  });
});
