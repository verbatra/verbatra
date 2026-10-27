import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { AdapterError } from "../errors.js";
import { createArbAdapter } from "./arb-adapter.js";

const adapter = createArbAdapter();

const BOM = "﻿";

const SAMPLE = {
  "@@locale": "en",
  greeting: "Hello {name}",
  "@greeting": { description: "A greeting", placeholders: { name: { type: "String" } } },
  items: "{count, plural, one {# item} other {# items}}",
  "@items": { description: "Item count" },
};

async function tempArb(name: string, value: unknown): Promise<string> {
  const path = join(await mkdtemp(join(tmpdir(), "verbatra-arb-")), name);
  await writeFile(path, JSON.stringify(value, null, 2));
  return path;
}

async function rawArbFile(name: string, content: string): Promise<string> {
  const path = join(await mkdtemp(join(tmpdir(), "verbatra-arb-")), name);
  await writeFile(path, content);
  return path;
}

async function readError(promise: Promise<unknown>): Promise<unknown> {
  return promise.catch((error: unknown) => error);
}

describe("createArbAdapter detection", () => {
  it("handles .arb with a brace sniff", () => {
    expect(adapter.canHandle("app_en.arb")).toBe(true);
    expect(adapter.canHandle("app_en.arb", "{")).toBe(true);
    expect(adapter.canHandle("app_en.arb", "not json")).toBe(false);
    expect(adapter.canHandle("app_en.json")).toBe(false);
  });

  it("reports format arb", () => {
    expect(adapter.format).toBe("arb");
  });

  it("exposes the ICU branch-arm check, holding a plural to the target language's categories", () => {
    const source = "{count, plural, one {# item} other {# items}}";
    const russianShape = "{count, plural, one {# x} few {# x} many {# x} other {# x}}";
    const russian = () => ["one", "few", "many", "other"] as const;
    expect(adapter.compareBranchArms?.(source, russianShape, russian)).toEqual([]);
    expect(adapter.compareBranchArms?.(source, source, russian)).toHaveLength(2);
  });

  it("exposes branch-aware comparePlaceholders, catching a single-branch invention flat extraction misses", () => {
    const source = "{count, plural, one {# item} other {# items}}";
    const invented = "{count, plural, one {# item} other {# items by {author}}}";
    expect(adapter.comparePlaceholders?.(source, invented).matches).toBe(false);
    expect(adapter.comparePlaceholders?.(source, invented).extra).toEqual(["{author}"]);
  });
});

describe("createArbAdapter read", () => {
  it("strips @ and @@ metadata so only messages become entries", async () => {
    const { resource } = await adapter.read(await tempArb("app_en.arb", SAMPLE), "en");
    expect([...resource.entries.keys()]).toEqual(["greeting", "items"]);
    expect(resource.entries.has("@@locale")).toBe(false);
    expect(resource.entries.has("@greeting")).toBe(false);
  });

  it("extracts ICU placeholders and detects plurals", async () => {
    const { resource } = await adapter.read(await tempArb("app_en.arb", SAMPLE), "en");
    expect(resource.entries.get("greeting")?.placeholders).toEqual(["{name}"]);
    expect(resource.entries.get("items")?.isPlural).toBe(true);
  });

  it("populates entry.description from @key.description", async () => {
    const { resource } = await adapter.read(await tempArb("app_en.arb", SAMPLE), "en");
    expect(resource.entries.get("greeting")?.description).toBe("A greeting");
    expect(resource.entries.get("items")?.description).toBe("Item count");
  });

  it("leaves description undefined for a message with no @key.description", async () => {
    const { resource } = await adapter.read(
      await tempArb("app_en.arb", { plain: "No metadata" }),
      "en",
    );
    expect(resource.entries.get("plain")?.description).toBeUndefined();
  });

  it("aligns a dotted message key's description through the same literal-leaf encoding as flatten", async () => {
    const { resource } = await adapter.read(
      await tempArb("dotted.arb", {
        "page.title": "Welcome",
        "@page.title": { description: "The page title" },
      }),
      "en",
    );
    expect(resource.entries.get("page\\.title")?.description).toBe("The page title");
  });

  it("records invalid ICU values in invalidIcuKeys without throwing", async () => {
    const { invalidIcuKeys } = await adapter.read(
      await tempArb("app_en.arb", { ok: "Hi {name}", broken: "{count, plural, one {x" }),
      "en",
    );
    expect(invalidIcuKeys).toEqual(["broken"]);
  });

  it("rejects invalid JSON as INVALID_JSON", async () => {
    const path = join(await mkdtemp(join(tmpdir(), "verbatra-arb-")), "bad.arb");
    await writeFile(path, "{not json");
    expect(((await readError(adapter.read(path, "en"))) as AdapterError).code).toBe("INVALID_JSON");
  });

  it("rejects a non-object root as INVALID_STRUCTURE", async () => {
    const path = await tempArb("array.arb", ["not", "an", "object"]);
    expect(((await readError(adapter.read(path, "en"))) as AdapterError).code).toBe(
      "INVALID_STRUCTURE",
    );
  });

  it("reads metadata that carries numeric and nested leaves without rejecting it", async () => {
    const withRichMetadata = {
      "@@locale": "en",
      count: "{count, plural, one {# item} other {# items}}",
      "@count": {
        description: "Item count",
        placeholders: { count: { type: "int", optionalParameters: { decimalDigits: 2 } } },
      },
    };
    const path = await tempArb("app_en.arb", withRichMetadata);
    const { resource } = await adapter.read(path, "en");
    expect([...resource.entries.keys()]).toEqual(["count"]);
    expect(resource.entries.has("@count")).toBe(false);
  });
});

describe("createArbAdapter write (round-trip fidelity)", () => {
  it("preserves @-metadata and document order when writing back", async () => {
    const path = await tempArb("app_en.arb", SAMPLE);
    const { resource } = await adapter.read(path, "en");
    await adapter.write(resource, path);
    const written = JSON.parse(await readFile(path, "utf8"));
    expect(Object.keys(written)).toEqual(["@@locale", "greeting", "@greeting", "items", "@items"]);
    expect(written["@greeting"]).toEqual(SAMPLE["@greeting"]);
    expect(written["@@locale"]).toBe("en");
  });

  it("overwrites message values with translations, keeping metadata intact", async () => {
    const path = await tempArb("app_de.arb", SAMPLE);
    const { resource } = await adapter.read(path, "en");
    const translated = new Map(resource.entries);
    const greeting = translated.get("greeting");
    if (greeting) {
      translated.set("greeting", { ...greeting, value: "Hallo {name}" });
    }
    await adapter.write({ ...resource, entries: translated }, path);
    const written = JSON.parse(await readFile(path, "utf8"));
    expect(written.greeting).toBe("Hallo {name}");
    expect(written["@greeting"]).toEqual(SAMPLE["@greeting"]);
  });

  it("removes a message left out of the resource and its @key block, so it reads back missing", async () => {
    const path = await tempArb("app_de.arb", SAMPLE);
    const { resource } = await adapter.read(path, "en");
    const remaining = new Map(resource.entries);
    remaining.delete("items");
    await adapter.write({ ...resource, entries: remaining }, path);
    const written = JSON.parse(await readFile(path, "utf8"));
    expect(Object.keys(written)).toEqual(["@@locale", "greeting", "@greeting"]);
    expect((await adapter.read(path, "de")).resource.entries.has("items")).toBe(false);
  });

  it("starts a fresh target with @@locale for its locale, then the messages", async () => {
    const path = await tempArb("app_en.arb", SAMPLE);
    const { resource } = await adapter.read(path, "en");
    const fresh = join(await mkdtemp(join(tmpdir(), "verbatra-arb-")), "app_fr.arb");
    await adapter.write({ ...resource, locale: "fr" }, fresh);
    const written = JSON.parse(await readFile(fresh, "utf8"));
    expect(Object.keys(written)).toEqual(["@@locale", "greeting", "items"]);
    expect(written["@@locale"]).toBe("fr");
  });

  it("moves a hand-added @@locale to the top on rewrite, keeping its value", async () => {
    const path = await tempArb("app_de.arb", { greeting: "Hallo {name}", "@@locale": "de" });
    const { resource } = await adapter.read(path, "de");
    await adapter.write(resource, path);
    expect(Object.keys(JSON.parse(await readFile(path, "utf8")))).toEqual(["@@locale", "greeting"]);
  });

  it("round-trips metadata that carries numeric and nested leaves verbatim", async () => {
    const richMetadata = {
      description: "Item count",
      placeholders: { count: { type: "int", optionalParameters: { decimalDigits: 2 } } },
    };
    const path = await tempArb("app_en.arb", {
      "@@locale": "en",
      count: "{count, plural, one {# item} other {# items}}",
      "@count": richMetadata,
    });
    const { resource } = await adapter.read(path, "en");
    await adapter.write(resource, path);
    const written = JSON.parse(await readFile(path, "utf8"));
    expect(written["@count"]).toEqual(richMetadata);
    expect(written["@count"].placeholders.count.optionalParameters.decimalDigits).toBe(2);
    expect(Object.keys(written)).toEqual(["@@locale", "count", "@count"]);
  });

  it("round-trips a message key that contains a literal dot", async () => {
    const path = await tempArb("dotted.arb", { "page.title": "Welcome" });
    const { resource } = await adapter.read(path, "en");
    await adapter.write(resource, path);
    const written = JSON.parse(await readFile(path, "utf8"));
    expect(written).toEqual({ "page.title": "Welcome" });
  });

  it("round-trips mixed integer-like and named keys byte-identically, including integer-named placeholder metadata", async () => {
    const original = [
      "{",
      '  "zebra": "Z",',
      '  "10": "ten",',
      '  "count": "{1} of {0}",',
      '  "@count": {',
      '    "placeholders": {',
      '      "1": {',
      '        "type": "int"',
      "      },",
      '      "0": {',
      '        "type": "int"',
      "      }",
      "    }",
      "  },",
      '  "2": "two"',
      "}",
      "",
    ].join("\n");
    const path = await rawArbFile("app_en.arb", original);
    const { resource } = await adapter.read(path, "en");
    expect([...resource.entries.keys()]).toEqual(["zebra", "10", "count", "2"]);
    await adapter.write(resource, path);
    expect(await readFile(path, "utf8")).toBe(original);
  });
});

describe("createArbAdapter BOM handling", () => {
  it("reads a UTF-8 ARB file with a leading BOM into entries instead of failing", async () => {
    const content = `${BOM}${JSON.stringify(SAMPLE, null, 2)}`;
    const { resource } = await adapter.read(await rawArbFile("app_en.arb", content), "en");
    expect(resource.entries.get("greeting")?.value).toBe("Hello {name}");
  });

  it("rejects a BOM-only file as INVALID_JSON, not a crash", async () => {
    const error = await readError(adapter.read(await rawArbFile("empty.arb", BOM), "en"));
    expect((error as AdapterError).code).toBe("INVALID_JSON");
  });

  it("rejects an empty file as INVALID_JSON, not a crash", async () => {
    const error = await readError(adapter.read(await rawArbFile("empty.arb", ""), "en"));
    expect((error as AdapterError).code).toBe("INVALID_JSON");
  });

  it("never re-emits a BOM on write, for a source file that had one", async () => {
    const content = `${BOM}${JSON.stringify(SAMPLE, null, 2)}`;
    const path = await rawArbFile("app_en.arb", content);
    const { resource } = await adapter.read(path, "en");
    await adapter.write(resource, path);
    const written = await readFile(path, "utf8");
    expect(written.charCodeAt(0)).not.toBe(0xfeff);
    expect(JSON.parse(written).greeting).toBe("Hello {name}");
  });

  it("keeps a BOM-less file byte-stable in content on round-trip", async () => {
    const path = await tempArb("app_en.arb", SAMPLE);
    const { resource } = await adapter.read(path, "en");
    await adapter.write(resource, path);
    const written = await readFile(path, "utf8");
    expect(written.charCodeAt(0)).not.toBe(0xfeff);
    expect(JSON.parse(written).greeting).toBe("Hello {name}");
  });
});
