import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TranslationEntry } from "@verbatra/core";
import { describe, expect, it } from "vitest";
import { AdapterError } from "../errors.js";
import { MAX_INPUT_BYTES } from "../json/limits.js";
import { createGettextAdapter } from "./gettext-adapter.js";
import { composeKey } from "./key-encoding.js";

const adapter = createGettextAdapter();

async function tempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "verbatra-gettext-"));
}

async function tempFile(name: string, content: string): Promise<string> {
  const path = join(await tempDir(), name);
  await writeFile(path, content, "utf8");
  return path;
}

const EN_HEADER = [
  'msgid ""',
  'msgstr ""',
  '"Content-Type: text/plain; charset=UTF-8\\n"',
  '"Plural-Forms: nplurals=2; plural=(n != 1);\\n"',
  "",
  "",
].join("\n");

const JA_HEADER = [
  'msgid ""',
  'msgstr ""',
  '"Content-Type: text/plain; charset=UTF-8\\n"',
  '"Plural-Forms: nplurals=1; plural=0;\\n"',
  "",
  "",
].join("\n");

const PL_HEADER = [
  'msgid ""',
  'msgstr ""',
  '"Content-Type: text/plain; charset=UTF-8\\n"',
  '"Plural-Forms: nplurals=3; plural=(n==1 ? 0 : n%10>=2 && n%10<=4 && (n%100<10 || n%100>=20) ? 1 : 2);\\n"',
  "",
  "",
].join("\n");

describe("createGettextAdapter detection", () => {
  it("handles .po and .pot by extension only", () => {
    expect(adapter.canHandle("messages.po")).toBe(true);
    expect(adapter.canHandle("messages.pot")).toBe(true);
    expect(adapter.canHandle("messages.json")).toBe(false);
  });

  it("reports format gettext-po", () => {
    expect(adapter.format).toBe("gettext-po");
  });
});

describe("createGettextAdapter read/write round trip", () => {
  it("reads singular entries, msgctxt, and comments, then re-reads identically after a no-op write", async () => {
    const source = `${EN_HEADER}#. shown on the login form\nmsgctxt "menu"\nmsgid "Open"\nmsgstr "Oeffnen"\n\nmsgid "Close"\nmsgstr "Schliessen"\n\n`;
    const path = await tempFile("de.po", source);
    const { resource } = await adapter.read(path, "de");
    expect(resource.entries.size).toBe(2);
    await adapter.write(resource, path);
    const { resource: reread } = await adapter.read(path, "de");
    expect(reread.entries).toEqual(resource.entries);
    const written = await readFile(path, "utf8");
    expect(written).toContain("#. shown on the login form");
    expect(written).toContain('msgctxt "menu"');
  });

  it("reads a .pot template with empty msgstr values without error", async () => {
    const source = `${EN_HEADER}msgid "Hello"\nmsgstr ""\n\n`;
    const path = await tempFile("messages.pot", source);
    const { resource } = await adapter.read(path, "en");
    expect(resource.entries.get("Hello")).toMatchObject({ value: "" });
  });

  it("writes a new value and leaves everything else on disk unchanged", async () => {
    const source = `${EN_HEADER}#: src/app.ts:10\nmsgid "Save"\nmsgstr "Old"\n\n`;
    const path = await tempFile("de.po", source);
    const { resource } = await adapter.read(path, "de");
    const entries = new Map(resource.entries);
    entries.set("Save", { ...entries.get("Save"), value: "Neu" } as TranslationEntry);
    await adapter.write({ ...resource, entries }, path);
    const written = await readFile(path, "utf8");
    expect(written).toContain("#: src/app.ts:10");
    expect(written).toContain('msgstr "Neu"');
    expect(written).not.toContain('msgstr "Old"');
  });

  it("prunes a key removed from entries", async () => {
    const source = `${EN_HEADER}msgid "Stale"\nmsgstr "Alt"\n\nmsgid "Keep"\nmsgstr "Bleib"\n\n`;
    const path = await tempFile("de.po", source);
    const { resource } = await adapter.read(path, "de");
    const entries = new Map(resource.entries);
    entries.delete("Stale");
    await adapter.write({ ...resource, entries }, path);
    const written = await readFile(path, "utf8");
    expect(written).not.toContain("Stale");
    expect(written).toContain("Bleib");
  });

  it("appends a new key not present in the destination", async () => {
    const path = await tempFile("de.po", EN_HEADER);
    const { resource } = await adapter.read(path, "de");
    const entries = new Map(resource.entries);
    entries.set("Fresh", {
      key: "Fresh",
      namespace: resource.namespace,
      value: "Frisch",
      placeholders: [],
      isPlural: false,
    });
    await adapter.write({ ...resource, entries }, path);
    const written = await readFile(path, "utf8");
    expect(written).toContain('msgid "Fresh"');
    expect(written).toContain('msgstr "Frisch"');
  });

  it("creates the parent directory when writing to a destination that does not exist yet", async () => {
    const dir = await tempDir();
    const path = join(dir, "nested", "locales", "fr.po");
    const entries = new Map<string, TranslationEntry>([
      [
        "Hello",
        { key: "Hello", namespace: "", value: "Bonjour", placeholders: [], isPlural: false },
      ],
    ]);
    await adapter.write({ locale: "fr", namespace: "", format: "gettext-po", entries }, path);
    const written = await readFile(path, "utf8");
    expect(written).toContain('msgid "Hello"');
    expect(written).toContain('msgstr "Bonjour"');
  });

  it("rejects oversized input with INPUT_TOO_LARGE", async () => {
    const path = await tempFile("big.po", "x".repeat(MAX_INPUT_BYTES + 1));
    const error = await adapter.read(path, "de").catch((thrown: unknown) => thrown);
    expect(error).toBeInstanceOf(AdapterError);
    expect((error as AdapterError).code).toBe("INPUT_TOO_LARGE");
  });

  it("rejects a malformed .po with a structured AdapterError naming the problem", async () => {
    const path = await tempFile("broken.po", `${EN_HEADER}msgid "Hi"\n`);
    const error = await adapter.read(path, "de").catch((thrown: unknown) => thrown);
    expect(error).toBeInstanceOf(AdapterError);
    expect((error as AdapterError).message).toMatch(/msgstr/);
  });
});

describe("createGettextAdapter: plural forms across languages with different nplurals", () => {
  it("English (2 forms): reads, retranslates, and re-reads with both indices intact", async () => {
    const source = `${EN_HEADER}msgid "one item"\nmsgid_plural "%d items"\nmsgstr[0] "one item"\nmsgstr[1] "%d items"\n\n`;
    const path = await tempFile("en.po", source);
    const { resource } = await adapter.read(path, "en");
    expect(resource.entries.size).toBe(2);
    const key0 = composeKey(undefined, "one item", 0);
    const key1 = composeKey(undefined, "one item", 1);
    expect(resource.entries.get(key0)).toMatchObject({ value: "one item", isPlural: true });
    expect(resource.entries.get(key1)).toMatchObject({ value: "%d items", isPlural: true });
    await adapter.write(resource, path);
    const { resource: reread } = await adapter.read(path, "en");
    expect(reread.entries).toEqual(resource.entries);
  });

  it("Japanese (1 form): reads and round-trips a single msgstr[0]", async () => {
    const source = `${JA_HEADER}msgid "one item"\nmsgid_plural "%d items"\nmsgstr[0] "%d個のアイテム"\n\n`;
    const path = await tempFile("ja.po", source);
    const { resource } = await adapter.read(path, "ja");
    expect(resource.entries.size).toBe(1);
    await adapter.write(resource, path);
    const { resource: reread } = await adapter.read(path, "ja");
    expect(reread.entries).toEqual(resource.entries);
  });

  it("Polish (3 forms): reads and round-trips msgstr[0..2]", async () => {
    const source = `${PL_HEADER}msgid "one item"\nmsgid_plural "%d items"\nmsgstr[0] "jeden"\nmsgstr[1] "dwa"\nmsgstr[2] "wiele"\n\n`;
    const path = await tempFile("pl.po", source);
    const { resource } = await adapter.read(path, "pl");
    expect(resource.entries.size).toBe(3);
    await adapter.write(resource, path);
    const { resource: reread } = await adapter.read(path, "pl");
    expect(reread.entries).toEqual(resource.entries);
  });

  it("extracts printf placeholders consistently through extractPlaceholders", () => {
    expect(adapter.extractPlaceholders("%d items for %(user)s")).toEqual(["%d", "%(user)s"]);
  });
});
