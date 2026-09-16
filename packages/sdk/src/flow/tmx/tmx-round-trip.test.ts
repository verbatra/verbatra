import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { computeFingerprint } from "../../cache/fingerprint.js";
import { cacheFilePath, readTranslationMemory } from "../../cache/translation-memory.js";
import type { TranslationMemory } from "../../cache/types.js";
import type { VerbatraConfig } from "../../config/schema.js";
import { defaultFs } from "../../fs.js";
import { baseConfig, makeStubProvider, makeTempDir, writeJsonFile } from "../../test-support.js";
import { translate } from "../translate-project.js";
import { exportTmx } from "./export-tmx.js";
import { importTmx } from "./import-tmx.js";

const cfg = (overrides: Partial<VerbatraConfig> = {}): VerbatraConfig =>
  baseConfig({
    sourceLocale: "en",
    targetLocales: ["de"],
    format: "i18next-json",
    ...overrides,
  });

const AWKWARD: Readonly<Record<string, string>> = {
  markup: "Read the <b>terms &amp; conditions</b>",
  multiline: "First line\nSecond line",
  carriageReturn: "First line\r\nSecond line",
  padded: "   padded on both sides   ",
  nonLatin: "Grüße aus München",
  japanese: "設定を保存しました",
  arabic: "تم حفظ الإعدادات",
  emoji: "Saved 🎉 and done",
  ampersand: "AT&T and &amp; together",
};

async function projectWith(source: Readonly<Record<string, string>>): Promise<string> {
  const dir = await makeTempDir();
  await mkdir(join(dir, "locales"));
  await writeJsonFile(join(dir, "locales", "en.json"), source);
  return dir;
}

async function memoryOf(dir: string): Promise<TranslationMemory> {
  return (await readTranslationMemory(cacheFilePath(dir), defaultFs)).memory;
}

function bucketOf(memory: TranslationMemory, config: VerbatraConfig, locale: string) {
  return memory.entries[computeFingerprint(config)]?.[locale] ?? {};
}

describe("a memory survives being exported to TMX and imported back", () => {
  it("rebuilds the same entries and sources from a file it wrote itself", async () => {
    const config = cfg();
    const dir = await projectWith(AWKWARD);
    const stub = makeStubProvider();
    await translate({ config, cwd: dir }, { createProvider: () => stub.provider });
    const original = await memoryOf(dir);
    const exported = await exportTmx({ config, cwd: dir, toolVersion: "1.0.0" });

    const empty = await projectWith(AWKWARD);
    await writeJsonFile(join(empty, "memory.tmx"), {});
    await readFile(exported.path, "utf8").then((text) =>
      defaultFs.writeFile(join(empty, "memory.tmx"), text),
    );
    const result = await importTmx({ config, file: "memory.tmx", cwd: empty });

    expect(result.locales[0]?.rejected).toEqual({
      placeholder: 0,
      markup: 0,
      icu: 0,
      degenerate: 0,
      empty: 0,
      sourceBlank: 0,
    });
    const rebuilt = await memoryOf(empty);
    expect(bucketOf(rebuilt, config, "de")).toEqual(bucketOf(original, config, "de"));
    expect(rebuilt.sources).toEqual(original.sources);
  });

  it("carries a carriage return, leading whitespace and a non-Latin script through unchanged", async () => {
    const config = cfg();
    const dir = await projectWith(AWKWARD);
    const stub = makeStubProvider();
    await translate({ config, cwd: dir }, { createProvider: () => stub.provider });

    const exported = await exportTmx({ config, cwd: dir, toolVersion: "1.0.0" });
    const text = await readFile(exported.path, "utf8");

    for (const value of Object.values(AWKWARD)) {
      expect(text).toContain(
        value
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;")
          .replaceAll("\r", "&#13;"),
      );
    }
  });

  it("is stable across a second export of the re-imported memory", async () => {
    const config = cfg();
    const dir = await projectWith(AWKWARD);
    const stub = makeStubProvider();
    await translate({ config, cwd: dir }, { createProvider: () => stub.provider });
    const first = await exportTmx({ config, cwd: dir, out: "first.tmx", toolVersion: "1.0.0" });

    const empty = await projectWith(AWKWARD);
    await defaultFs.writeFile(join(empty, "memory.tmx"), await readFile(first.path, "utf8"));
    await importTmx({ config, file: "memory.tmx", cwd: empty });
    const second = await exportTmx({ config, cwd: empty, out: "second.tmx", toolVersion: "1.0.0" });

    expect(await readFile(second.path, "utf8")).toBe(await readFile(first.path, "utf8"));
  });
});

describe("an imported unit is reused by a later run without a provider call", () => {
  it("makes zero provider calls for a key whose source an imported unit matches", async () => {
    const config = cfg();
    const dir = await projectWith({ greeting: "Hello", farewell: "Goodbye" });
    await defaultFs.writeFile(
      join(dir, "memory.tmx"),
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<tmx version="1.4">',
        '  <header srclang="en-US" creationtool="other" creationtoolversion="1" segtype="block" o-tmf="other" adminlang="en" datatype="plaintext"/>',
        "  <body>",
        '    <tu><tuv xml:lang="en-US"><seg>Hello</seg></tuv><tuv xml:lang="de-DE"><seg>Hallo</seg></tuv></tu>',
        '    <tu><tuv xml:lang="en-US"><seg>Goodbye</seg></tuv><tuv xml:lang="de-DE"><seg>Tschuess</seg></tuv></tu>',
        "  </body>",
        "</tmx>",
      ].join("\n"),
    );

    await importTmx({ config, file: "memory.tmx", cwd: dir });
    const stub = makeStubProvider();
    await translate({ config, cwd: dir }, { createProvider: () => stub.provider });

    expect(stub.calls).toEqual([]);
    expect(JSON.parse(await readFile(join(dir, "locales", "de.json"), "utf8"))).toEqual({
      greeting: "Hallo",
      farewell: "Tschuess",
    });
  });

  it("still calls the provider for a key the imported file never covered", async () => {
    const config = cfg();
    const dir = await projectWith({ greeting: "Hello", untouched: "Nothing here" });
    await defaultFs.writeFile(
      join(dir, "memory.tmx"),
      [
        '<tmx version="1.4">',
        '  <header srclang="en"/>',
        '  <body><tu><tuv xml:lang="en"><seg>Hello</seg></tuv><tuv xml:lang="de"><seg>Hallo</seg></tuv></tu></body>',
        "</tmx>",
      ].join("\n"),
    );

    await importTmx({ config, file: "memory.tmx", cwd: dir });
    const stub = makeStubProvider();
    await translate({ config, cwd: dir }, { createProvider: () => stub.provider });

    expect(stub.calls).toHaveLength(1);
    expect(stub.calls[0]?.request.entries.map((entry) => entry.key)).toEqual(["untouched"]);
  });
});
