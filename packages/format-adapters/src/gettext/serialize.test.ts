import type { TranslationEntry } from "@verbatra/core";
import { describe, expect, it } from "vitest";
import { createMemoryAdapterFs } from "../test-support.js";
import { composeKey } from "./key-encoding.js";
import { parsePoEntries } from "./parse.js";
import { serializePoEntries } from "./serialize.js";

const EN_HEADER = [
  'msgid ""',
  'msgstr ""',
  '"Content-Type: text/plain; charset=UTF-8\\n"',
  '"Plural-Forms: nplurals=2; plural=(n != 1);\\n"',
  "",
  "",
].join("\n");

function entry(
  key: string,
  value: string,
  overrides: Partial<TranslationEntry> = {},
): TranslationEntry {
  return { key, namespace: "messages", value, placeholders: [], isPlural: false, ...overrides };
}

describe("serializePoEntries: destination re-read and mutate in place", () => {
  it("re-reads to an identical entry map when no value changed", async () => {
    const content = `${EN_HEADER}#. developer note\nmsgctxt "menu"\nmsgid "Open"\nmsgstr "Oeffnen"\n\n`;
    const fs = createMemoryAdapterFs({ "/en.po": content });
    const entries = parsePoEntries(content, "messages");
    const written = await serializePoEntries(entries, "/en.po", fs);
    expect(parsePoEntries(written, "messages")).toEqual(entries);
  });

  it("leaves comments, references, flags, msgctxt, and the header unchanged in the file", async () => {
    const content = `${EN_HEADER}#. note\n#: src/app.ts:1\n#, fuzzy\nmsgctxt "menu"\nmsgid "Open"\nmsgstr "Old"\n\n`;
    const fs = createMemoryAdapterFs({ "/en.po": content });
    const key = composeKey("menu", "Open");
    const written = await serializePoEntries(new Map([[key, entry(key, "New")]]), "/en.po", fs);
    expect(written).toContain("#. note");
    expect(written).toContain("#: src/app.ts:1");
    expect(written).toContain("#, fuzzy");
    expect(written).toContain('msgctxt "menu"');
    expect(written).toContain('"Plural-Forms: nplurals=2; plural=(n != 1);\\n"');
    expect(written).toContain('msgstr "New"');
    expect(written).not.toContain('msgstr "Old"');
  });

  it("drops a key no longer present in entries", async () => {
    const content = `${EN_HEADER}msgid "Stale"\nmsgstr "Alt"\n\nmsgid "Keep"\nmsgstr "Bleib"\n\n`;
    const fs = createMemoryAdapterFs({ "/en.po": content });
    const written = await serializePoEntries(
      new Map([["Keep", entry("Keep", "Bleib")]]),
      "/en.po",
      fs,
    );
    expect(written).not.toContain("Stale");
    expect(written).toContain("Bleib");
  });

  it("drops a whole plural group once every index is removed", async () => {
    const content = `${EN_HEADER}msgid "one item"\nmsgid_plural "%d items"\nmsgstr[0] "one"\nmsgstr[1] "many"\n\n`;
    const fs = createMemoryAdapterFs({ "/en.po": content });
    const written = await serializePoEntries(new Map(), "/en.po", fs);
    expect(written).not.toContain("msgid_plural");
    expect(written).not.toContain("one item");
  });

  it("keeps surviving plural indices when only one is removed", async () => {
    const content = `${EN_HEADER}msgid "one item"\nmsgid_plural "%d items"\nmsgstr[0] "one"\nmsgstr[1] "many"\n\n`;
    const fs = createMemoryAdapterFs({ "/en.po": content });
    const key1 = composeKey(undefined, "one item", 1);
    const written = await serializePoEntries(new Map([[key1, entry(key1, "many!")]]), "/en.po", fs);
    expect(written).not.toContain("msgstr[0]");
    expect(written).toContain('msgstr[1] "many!"');
  });

  it("appends a brand-new singular entry not present in the destination", async () => {
    const fs = createMemoryAdapterFs({ "/en.po": EN_HEADER });
    const written = await serializePoEntries(
      new Map([["Fresh", entry("Fresh", "Frisch")]]),
      "/en.po",
      fs,
    );
    expect(written).toContain('msgid "Fresh"');
    expect(written).toContain('msgstr "Frisch"');
  });

  it("appends a brand-new plural group with a synthesized msgid_plural from meaning", async () => {
    const fs = createMemoryAdapterFs({ "/en.po": EN_HEADER });
    const base = composeKey(undefined, "one new item");
    const key0 = composeKey(undefined, "one new item", 0);
    const key1 = composeKey(undefined, "one new item", 1);
    const written = await serializePoEntries(
      new Map([
        [key0, entry(key0, "one new item", { isPlural: true, meaning: "%d new items" })],
        [key1, entry(key1, "%d new items", { isPlural: true, meaning: "%d new items" })],
      ]),
      "/en.po",
      fs,
    );
    expect(written).toContain(`msgid "${base}"`);
    expect(written).toContain('msgid_plural "%d new items"');
    expect(written).toContain('msgstr[0] "one new item"');
    expect(written).toContain('msgstr[1] "%d new items"');
  });

  it("escapes translated values written back to disk", async () => {
    const fs = createMemoryAdapterFs({ "/en.po": EN_HEADER });
    const written = await serializePoEntries(
      new Map([["Quote", entry("Quote", 'She said "hi"\nnext line')]]),
      "/en.po",
      fs,
    );
    expect(written).toContain('msgstr "She said \\"hi\\"\\nnext line"');
  });
});

describe("serializePoEntries: additional edge cases", () => {
  it("appends a brand-new msgctxt-disambiguated entry", async () => {
    const fs = createMemoryAdapterFs({ "/en.po": EN_HEADER });
    const key = composeKey("menu", "Open");
    const written = await serializePoEntries(new Map([[key, entry(key, "Oeffnen")]]), "/en.po", fs);
    expect(written).toContain('msgctxt "menu"');
    expect(written).toContain('msgid "Open"');
  });

  it("falls back to msgid for msgid_plural when no entry carries meaning", async () => {
    const fs = createMemoryAdapterFs({ "/en.po": EN_HEADER });
    const key0 = composeKey(undefined, "item", 0);
    const key1 = composeKey(undefined, "item", 1);
    const written = await serializePoEntries(
      new Map([
        [key0, entry(key0, "one", { isPlural: true })],
        [key1, entry(key1, "many", { isPlural: true })],
      ]),
      "/en.po",
      fs,
    );
    expect(written).toContain('msgid_plural "item"');
  });

  it("wraps a non-ENOENT destination read failure in a structured AdapterError", async () => {
    const fs = createMemoryAdapterFs();
    fs.readBounded = async () => {
      throw new Error("EACCES: permission denied");
    };
    await expect(serializePoEntries(new Map(), "/en.po", fs)).rejects.toMatchObject({
      code: "INVALID_STRUCTURE",
    });
  });
});

describe("serializePoEntries: synthesis for a destination that does not exist yet", () => {
  it("produces a well-formed singular-only .po with a minimal header and no Plural-Forms", async () => {
    const fs = createMemoryAdapterFs();
    const written = await serializePoEntries(
      new Map([["Hello", entry("Hello", "Hallo")]]),
      "/missing/fr.po",
      fs,
    );
    expect(written).toContain('msgid ""');
    expect(written).toContain("Content-Type: text/plain; charset=UTF-8");
    expect(written).not.toContain("Plural-Forms");
    expect(written).toContain('msgid "Hello"');
    expect(written).toContain('msgstr "Hallo"');
    const reread = parsePoEntries(written, "messages");
    expect(reread.get("Hello")).toMatchObject({ value: "Hallo" });
  });

  it("adds a Plural-Forms header sized to the highest index actually present", async () => {
    const fs = createMemoryAdapterFs();
    const key0 = composeKey(undefined, "item", 0);
    const key1 = composeKey(undefined, "item", 1);
    const written = await serializePoEntries(
      new Map([
        [key0, entry(key0, "one", { isPlural: true, meaning: "items" })],
        [key1, entry(key1, "many", { isPlural: true, meaning: "items" })],
      ]),
      "/missing/en.po",
      fs,
    );
    expect(written).toContain("Plural-Forms: nplurals=2; plural=(n != 1);");
    const reread = parsePoEntries(written, "messages");
    expect(reread.get(key0)).toMatchObject({ value: "one" });
    expect(reread.get(key1)).toMatchObject({ value: "many" });
  });
});
