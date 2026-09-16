import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { contentHash } from "@verbatra/core";
import { readTmx } from "@verbatra/exchange";
import { describe, expect, it } from "vitest";
import { computeFingerprint } from "../../cache/fingerprint.js";
import { CACHE_FILE_NAME } from "../../cache/translation-memory.js";
import type { VerbatraConfig } from "../../config/schema.js";
import { SdkError } from "../../errors.js";
import { baseConfig, makeTempDir, writeJsonFile } from "../../test-support.js";
import { DEFAULT_TMX_PATH, exportTmx } from "./export-tmx.js";
import { importTmx } from "./import-tmx.js";

const cfg = (overrides: Partial<VerbatraConfig> = {}): VerbatraConfig =>
  baseConfig({
    sourceLocale: "en",
    targetLocales: ["de", "fr"],
    format: "i18next-json",
    ...overrides,
  });

function hashOf(value: string): string {
  return contentHash({ key: "tmx", namespace: "", value, placeholders: [], isPlural: false });
}

async function withMemory(
  config: VerbatraConfig,
  entries: Readonly<Record<string, Readonly<Record<string, string>>>>,
  sources: Readonly<Record<string, string>>,
): Promise<string> {
  const dir = await makeTempDir();
  await writeJsonFile(join(dir, CACHE_FILE_NAME), {
    version: 2,
    entries: { [computeFingerprint(config)]: entries },
    sources,
  });
  return dir;
}

describe("exportTmx writes the memory as TMX", () => {
  it("writes one unit per source string carrying every exported locale", async () => {
    const config = cfg();
    const dir = await withMemory(
      config,
      { de: { [hashOf("Hello")]: "Hallo" }, fr: { [hashOf("Hello")]: "Bonjour" } },
      { [hashOf("Hello")]: "Hello" },
    );

    const result = await exportTmx({ config, cwd: dir });

    expect(result.units).toBe(1);
    expect(result.locales).toEqual([
      { locale: "de", units: 1 },
      { locale: "fr", units: 1 },
    ]);
    const document = readTmx(await readFile(result.path, "utf8"));
    expect(document.sourceLanguage).toBe("en");
    expect(document.units[0]?.segments).toEqual([
      { language: "en", text: "Hello" },
      { language: "de", text: "Hallo" },
      { language: "fr", text: "Bonjour" },
    ]);
  });

  it("writes to the default path when none is given", async () => {
    const config = cfg();
    const dir = await withMemory(config, {}, {});

    expect((await exportTmx({ config, cwd: dir })).path).toBe(join(dir, DEFAULT_TMX_PATH));
  });

  it("creates the directory the output path names", async () => {
    const config = cfg();
    const dir = await withMemory(config, {}, {});

    const result = await exportTmx({ config, cwd: dir, out: "out/nested/memory.tmx" });

    expect(await readFile(result.path, "utf8")).toContain("<tmx");
  });

  it("stamps the tool version it is handed", async () => {
    const config = cfg();
    const dir = await withMemory(config, {}, {});

    const result = await exportTmx({ config, cwd: dir, toolVersion: "1.2.3" });

    expect(await readFile(result.path, "utf8")).toContain('creationtoolversion="1.2.3"');
  });

  it("writes a valid empty document when the memory is empty", async () => {
    const config = cfg();
    const dir = await makeTempDir();

    const result = await exportTmx({ config, cwd: dir });

    expect(result.units).toBe(0);
    const document = readTmx(await readFile(result.path, "utf8"));
    expect(document.units).toEqual([]);
    expect(document.sourceLanguage).toBe("en");
  });

  it("writes only the requested locales", async () => {
    const config = cfg();
    const dir = await withMemory(
      config,
      { de: { [hashOf("Hello")]: "Hallo" }, fr: { [hashOf("Hello")]: "Bonjour" } },
      { [hashOf("Hello")]: "Hello" },
    );

    const result = await exportTmx({ config, cwd: dir, locales: ["fr"] });

    expect(result.locales).toEqual([{ locale: "fr", units: 1 }]);
    const document = readTmx(await readFile(result.path, "utf8"));
    expect(document.units[0]?.segments).toEqual([
      { language: "en", text: "Hello" },
      { language: "fr", text: "Bonjour" },
    ]);
  });

  it("refuses the same config an import refuses, so it cannot write a file it could not read back", async () => {
    const config = cfg({ sourceLocale: "pt-BR", targetLocales: ["pt_BR"] });
    const dir = await makeTempDir();

    await expect(exportTmx({ config, cwd: dir })).rejects.toMatchObject({
      code: "CONFIG_INVALID",
    });
  });

  it("refuses a locale that is not configured", async () => {
    const config = cfg();
    const dir = await withMemory(config, {}, {});

    await expect(exportTmx({ config, cwd: dir, locales: ["ja"] })).rejects.toThrow(SdkError);
  });

  it("leaves out an entry whose source text the memory never recorded, and counts it", async () => {
    const config = cfg();
    const dir = await withMemory(
      config,
      { de: { [hashOf("Hello")]: "Hallo", orphan: "Waise" } },
      { [hashOf("Hello")]: "Hello" },
    );

    const result = await exportTmx({ config, cwd: dir });

    expect(result.units).toBe(1);
    expect(result.withoutSource).toBe(1);
    expect(result.locales).toEqual([
      { locale: "de", units: 1 },
      { locale: "fr", units: 0 },
    ]);
  });

  it("writes nothing from a configuration fingerprint other than the current one", async () => {
    const config = cfg();
    const dir = await withMemory(
      config,
      { de: { [hashOf("Hello")]: "Hallo" } },
      { [hashOf("Hello")]: "Hello" },
    );

    const result = await exportTmx({ config: cfg({ tone: "formal" }), cwd: dir });

    expect(result.units).toBe(0);
  });

  it("orders units by source hash, not by which locale contributed one first", async () => {
    const config = cfg();
    const dir = await withMemory(
      config,
      {
        de: { [hashOf("Hello")]: "Hallo", [hashOf("Save")]: "Speichern" },
        fr: { [hashOf("Goodbye")]: "Au revoir" },
      },
      {
        [hashOf("Hello")]: "Hello",
        [hashOf("Save")]: "Save",
        [hashOf("Goodbye")]: "Goodbye",
      },
    );

    const forward = await exportTmx({ config, cwd: dir, out: "forward.tmx", toolVersion: "1" });
    const reversed = await exportTmx({
      config: cfg({ targetLocales: ["fr", "de"] }),
      cwd: dir,
      out: "reversed.tmx",
      toolVersion: "1",
    });

    const sources = async (path: string) =>
      readTmx(await readFile(path, "utf8")).units.map((unit) => unit.segments[0]?.text);
    expect(await sources(reversed.path)).toEqual(await sources(forward.path));
  });

  it("orders units deterministically, so two exports of one memory are byte-identical", async () => {
    const config = cfg();
    const dir = await withMemory(
      config,
      {
        de: {
          [hashOf("Hello")]: "Hallo",
          [hashOf("Goodbye")]: "Tschuess",
          [hashOf("Save")]: "Speichern",
        },
      },
      {
        [hashOf("Hello")]: "Hello",
        [hashOf("Goodbye")]: "Goodbye",
        [hashOf("Save")]: "Save",
      },
    );

    const first = await exportTmx({ config, cwd: dir, out: "a.tmx", toolVersion: "1" });
    const second = await exportTmx({ config, cwd: dir, out: "b.tmx", toolVersion: "1" });

    expect(await readFile(second.path, "utf8")).toBe(await readFile(first.path, "utf8"));
  });
});

describe("exportTmx writes BCP 47 language tags however the config spells its locales", () => {
  it("writes en_US and pt_BR as en-US and pt-BR, and the file re-imports into the same config", async () => {
    const config = cfg({ sourceLocale: "en_US", targetLocales: ["pt_BR"] });
    const dir = await withMemory(
      config,
      { pt_BR: { [hashOf("Save")]: "Salvar" } },
      { [hashOf("Save")]: "Save" },
    );

    const result = await exportTmx({ config, cwd: dir });
    const text = await readFile(result.path, "utf8");

    expect(text).toContain('srclang="en-US"');
    expect(text).toContain('<tuv xml:lang="en-US"><seg>Save</seg></tuv>');
    expect(text).toContain('<tuv xml:lang="pt-BR"><seg>Salvar</seg></tuv>');
    expect(text).not.toContain("_");

    const fresh = await makeTempDir();
    await writeFile(join(fresh, "memory.tmx"), text, "utf8");
    const imported = await importTmx({ config, file: "memory.tmx", cwd: fresh });

    expect(imported.sourceLanguageMismatch).toBeUndefined();
    expect(imported.unmatchedLanguages).toEqual([]);
    expect(imported.locales).toEqual([expect.objectContaining({ locale: "pt_BR", added: 1 })]);
    const memory = JSON.parse(await readFile(join(fresh, CACHE_FILE_NAME), "utf8"));
    expect(memory.entries[computeFingerprint(config)]).toEqual({
      pt_BR: { [hashOf("Save")]: "Salvar" },
    });
    expect(memory.sources).toEqual({ [hashOf("Save")]: "Save" });
  });
});
