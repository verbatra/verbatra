import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { contentHash } from "@verbatra/core";
import { describe, expect, it } from "vitest";
import { computeFingerprint } from "../../cache/fingerprint.js";
import { CACHE_FILE_NAME } from "../../cache/translation-memory.js";
import type { TranslationMemory } from "../../cache/types.js";
import type { VerbatraConfig } from "../../config/schema.js";
import { verbatraConfigSchema } from "../../config/schema.js";
import { SdkError } from "../../errors.js";
import { baseConfig, makeTempDir, readJsonFile, writeJsonFile } from "../../test-support.js";
import { importTmx } from "./import-tmx.js";

const cfg = (overrides: Partial<VerbatraConfig> = {}): VerbatraConfig =>
  baseConfig({ sourceLocale: "en", targetLocales: ["de", "fr"], ...overrides });

function tu(pairs: ReadonlyArray<readonly [string, string]>): string {
  return `    <tu>\n${pairs
    .map(([lang, seg]) => `      <tuv xml:lang="${lang}"><seg>${seg}</seg></tuv>`)
    .join("\n")}\n    </tu>`;
}

function tmxDocument(units: readonly string[], srclang = "en"): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<tmx version="1.4">',
    `  <header srclang="${srclang}" creationtool="probe" creationtoolversion="1" segtype="block" o-tmf="probe" adminlang="en" datatype="plaintext"/>`,
    "  <body>",
    ...units,
    "  </body>",
    "</tmx>",
  ].join("\n");
}

async function project(units: readonly string[], srclang = "en"): Promise<string> {
  const dir = await makeTempDir();
  await mkdir(join(dir, "locales"));
  await writeJsonFile(join(dir, "locales", "en.json"), { greeting: "Hello" });
  await writeFile(join(dir, "memory.tmx"), tmxDocument(units, srclang), "utf8");
  return dir;
}

async function memoryOf(dir: string): Promise<TranslationMemory> {
  try {
    return (await readJsonFile(join(dir, CACHE_FILE_NAME))) as TranslationMemory;
  } catch {
    return { version: 2, entries: {}, sources: {} };
  }
}

function hashOf(value: string): string {
  return contentHash({ key: "tmx", namespace: "", value, placeholders: [], isPlural: false });
}

function bucket(
  memory: TranslationMemory,
  config: VerbatraConfig,
  locale: string,
): Record<string, string> {
  return memory.entries[computeFingerprint(config)]?.[locale] ?? {};
}

async function storedFor(
  dir: string,
  config: VerbatraConfig,
  locale: string,
): Promise<Array<readonly [string, string]>> {
  const memory = await memoryOf(dir);
  return Object.entries(bucket(memory, config, locale)).map(([hash, value]) => [
    memory.sources[hash] ?? "<no source>",
    value,
  ]);
}

describe("locale resolution never attributes a translation to the wrong source text", () => {
  it("refuses a config whose source and target differ only by case, at both gates", async () => {
    const parsed = verbatraConfigSchema.safeParse({
      ...baseConfig({ sourceLocale: "en", targetLocales: ["EN"] }),
    });
    expect(parsed.success).toBe(false);

    const dir = await project([
      tu([
        ["en", "Hello"],
        ["EN", "Hullo"],
      ]),
    ]);
    const config = cfg({ sourceLocale: "en", targetLocales: ["EN"] });

    await expect(importTmx({ config, file: "memory.tmx", cwd: dir })).rejects.toMatchObject({
      code: "CONFIG_INVALID",
    });
  });

  it("refuses a source and target that differ only by separator, which the schema lets through", async () => {
    const parsed = verbatraConfigSchema.safeParse(
      baseConfig({ sourceLocale: "pt-BR", targetLocales: ["pt_BR"] }),
    );
    expect(parsed.success).toBe(true);

    const dir = await project([
      tu([
        ["pt-BR", "Ola"],
        ["pt_BR", "Olá"],
      ]),
    ]);
    const config = cfg({ sourceLocale: "pt-BR", targetLocales: ["pt_BR"] });

    const error = await importTmx({ config, file: "memory.tmx", cwd: dir }).catch(
      (thrown: unknown) => thrown,
    );

    expect(error).toBeInstanceOf(SdkError);
    expect((error as SdkError).code).toBe("CONFIG_INVALID");
  });

  it("keeps a script-subtag source and a region-subtag target apart", async () => {
    const config = cfg({ sourceLocale: "zh-Hans", targetLocales: ["zh-CN"] });
    const dir = await project(
      [
        tu([
          ["zh-Hans", "Save"],
          ["zh-CN", "保存"],
        ]),
      ],
      "zh-Hans",
    );

    const result = await importTmx({ config, file: "memory.tmx", cwd: dir });

    expect(result.locales).toEqual([
      expect.objectContaining({ locale: "zh-CN", added: 1, kept: 0 }),
    ]);
    expect(result.conflictingSourceUnits).toBe(0);
    expect(await storedFor(dir, config, "zh-CN")).toEqual([["Save", "保存"]]);
  });

  it("widens a bare tag onto the region target, never onto the script-subtag source", async () => {
    const config = cfg({ sourceLocale: "zh-Hans", targetLocales: ["zh-CN"] });
    const dir = await project(
      [
        tu([
          ["zh-Hans", "Save"],
          ["zh", "储存"],
        ]),
      ],
      "zh-Hans",
    );

    const result = await importTmx({ config, file: "memory.tmx", cwd: dir });

    expect(result.ambiguousLanguages).toEqual([]);
    expect(result.locales[0]?.added).toBe(1);
    expect(await storedFor(dir, config, "zh-CN")).toEqual([["Save", "储存"]]);
  });

  it("does not widen a bare tag onto a configured locale that adds a script", async () => {
    const config = cfg({ sourceLocale: "en", targetLocales: ["sr-Latn"] });
    const dir = await project([
      tu([
        ["en", "Save"],
        ["sr", "Sačuvaj"],
      ]),
    ]);

    const result = await importTmx({ config, file: "memory.tmx", cwd: dir });

    expect(result.unmatchedLanguages).toEqual([{ language: "sr", units: 1 }]);
    expect(await storedFor(dir, config, "sr-Latn")).toEqual([]);
  });

  it("never resolves a tag onto a configured locale it is not a subtag prefix of", async () => {
    const config = cfg({ sourceLocale: "en", targetLocales: ["zh-TW"] });
    const dir = await project([
      tu([
        ["en", "Save"],
        ["zh-Hant-TW", "儲存"],
      ]),
    ]);

    const result = await importTmx({ config, file: "memory.tmx", cwd: dir });

    expect(result.unmatchedLanguages).toEqual([{ language: "zh-Hant-TW", units: 1 }]);
    expect(result.ambiguousLanguages).toEqual([]);
    expect(await storedFor(dir, config, "zh-TW")).toEqual([]);
  });

  it("does not store a simplified Chinese segment as traditional Chinese", async () => {
    const config = cfg({ sourceLocale: "en", targetLocales: ["zh-TW"] });
    const dir = await project([
      tu([
        ["en", "Save"],
        ["zh-CN", "保存"],
      ]),
    ]);

    const result = await importTmx({ config, file: "memory.tmx", cwd: dir });

    expect(result.unmatchedLanguages).toEqual([{ language: "zh-CN", units: 1 }]);
    expect(result.locales).toEqual([expect.objectContaining({ locale: "zh-TW", added: 0 })]);
    expect(await storedFor(dir, config, "zh-TW")).toEqual([]);
  });

  it("does not store a Latin-script Serbian segment as Cyrillic Serbian", async () => {
    const config = cfg({ sourceLocale: "en", targetLocales: ["sr-Cyrl"] });
    const dir = await project([
      tu([
        ["en", "Save"],
        ["sr-Latn", "Sačuvaj"],
      ]),
    ]);

    const result = await importTmx({ config, file: "memory.tmx", cwd: dir });

    expect(result.unmatchedLanguages).toEqual([{ language: "sr-Latn", units: 1 }]);
    expect(await storedFor(dir, config, "sr-Cyrl")).toEqual([]);
  });

  it("matches a hyphen-spelled tag onto an underscore-spelled configured locale", async () => {
    const config = cfg({ sourceLocale: "en", targetLocales: ["pt_BR"] });
    const dir = await project([
      tu([
        ["en", "Save"],
        ["pt-br", "Salvar"],
      ]),
    ]);

    const result = await importTmx({ config, file: "memory.tmx", cwd: dir });

    expect(result.locales).toEqual([expect.objectContaining({ locale: "pt_BR", added: 1 })]);
    expect(await storedFor(dir, config, "pt_BR")).toEqual([["Save", "Salvar"]]);
  });

  it("resolves a tag carrying extraneous extension and private subtags on its language", async () => {
    const config = cfg({ sourceLocale: "en", targetLocales: ["de"] });
    const dir = await project([
      tu([
        ["en", "Save"],
        ["de-DE-u-co-phonebk-x-internal", "Speichern"],
      ]),
    ]);

    const result = await importTmx({ config, file: "memory.tmx", cwd: dir });

    expect(result.unmatchedLanguages).toEqual([]);
    expect(await storedFor(dir, config, "de")).toEqual([["Save", "Speichern"]]);
  });

  it("does not let an extension-laden tag reach a locale that differs before the extension", async () => {
    const config = cfg({ sourceLocale: "en", targetLocales: ["de", "de-AT"] });
    const dir = await project([
      tu([
        ["en", "Save"],
        ["de-CH-u-co-phonebk", "Spiichere"],
      ]),
    ]);

    const result = await importTmx({ config, file: "memory.tmx", cwd: dir });

    expect(result.ambiguousLanguages).toEqual([]);
    expect(await storedFor(dir, config, "de")).toEqual([["Save", "Spiichere"]]);
    expect(await storedFor(dir, config, "de-AT")).toEqual([]);
  });

  it("imports units whose languages disagree with the header, and reports the header", async () => {
    const config = cfg();
    const dir = await project(
      [
        tu([
          ["en", "Save"],
          ["de", "Speichern"],
        ]),
      ],
      "ja",
    );

    const result = await importTmx({ config, file: "memory.tmx", cwd: dir });

    expect(result.sourceLanguage).toBe("ja");
    expect(result.sourceLanguageMismatch).toBe("ja");
    expect(await storedFor(dir, config, "de")).toEqual([["Save", "Speichern"]]);
  });

  it("stores the clean unit and reports the ambiguous one when a file holds both", async () => {
    const config = cfg({ sourceLocale: "en", targetLocales: ["pt-BR", "pt-PT"] });
    const dir = await project([
      tu([
        ["en", "Save"],
        ["pt-BR", "Salvar"],
      ]),
      tu([
        ["en", "Delete"],
        ["pt", "Apagar"],
      ]),
    ]);

    const result = await importTmx({ config, file: "memory.tmx", cwd: dir });

    expect(result.units).toBe(2);
    expect(result.ambiguousLanguages).toEqual([{ language: "pt", units: 1 }]);
    expect(await storedFor(dir, config, "pt-BR")).toEqual([["Save", "Salvar"]]);
    expect(await storedFor(dir, config, "pt-PT")).toEqual([]);
  });

  it("does not swallow a filtered-out target as the source when a subset is imported", async () => {
    const config = cfg({ sourceLocale: "en", targetLocales: ["de", "en-GB"] });
    const dir = await project([
      tu([
        ["en", "Color"],
        ["en-GB", "Colour"],
        ["de", "Farbe"],
      ]),
    ]);

    const result = await importTmx({
      config,
      file: "memory.tmx",
      cwd: dir,
      locales: ["de"],
    });

    expect(result.conflictingSourceUnits).toBe(0);
    expect(result.unmatchedSourceUnits).toBe(0);
    expect(result.locales.map((locale) => locale.locale)).toEqual(["de"]);
    expect(await storedFor(dir, config, "de")).toEqual([["Color", "Farbe"]]);
    expect(await storedFor(dir, config, "en-GB")).toEqual([]);
  });

  it("refuses the whole unit when two segments both resolve to the source locale", async () => {
    const config = cfg({ sourceLocale: "en", targetLocales: ["de"] });
    const dir = await project([
      tu([
        ["en", "Color"],
        ["en-GB", "Colour"],
        ["de", "Farbe"],
      ]),
    ]);

    const result = await importTmx({ config, file: "memory.tmx", cwd: dir });

    expect(result.conflictingSourceUnits).toBe(1);
    expect(await storedFor(dir, config, "de")).toEqual([]);
  });

  it("does not carry one unit's source across to the next unit that has none", async () => {
    const config = cfg({ sourceLocale: "en", targetLocales: ["de"] });
    const dir = await project([
      tu([
        ["en", "Save"],
        ["de", "Speichern"],
      ]),
      tu([["de", "Abbrechen"]]),
    ]);

    const result = await importTmx({ config, file: "memory.tmx", cwd: dir });

    expect(result.unmatchedSourceUnits).toBe(1);
    expect(await storedFor(dir, config, "de")).toEqual([["Save", "Speichern"]]);
    expect(bucket(await memoryOf(dir), config, "de")[hashOf("Save")]).toBe("Speichern");
  });

  it("keys by the unit's own source no matter what order the segments appear in", async () => {
    const config = cfg({ sourceLocale: "en", targetLocales: ["de"] });
    const dir = await project([
      tu([
        ["de", "Speichern"],
        ["en", "Save"],
      ]),
      tu([
        ["de", "Abbrechen"],
        ["en", "Cancel"],
      ]),
    ]);

    await importTmx({ config, file: "memory.tmx", cwd: dir });

    expect((await storedFor(dir, config, "de")).sort()).toEqual([
      ["Cancel", "Abbrechen"],
      ["Save", "Speichern"],
    ]);
  });

  it("reports a language no configured locale claims and stores nothing under it", async () => {
    const config = cfg({ sourceLocale: "en", targetLocales: ["de"] });
    const dir = await project([
      tu([
        ["en", "Save"],
        ["ja", "保存"],
        ["de", "Speichern"],
      ]),
    ]);

    const result = await importTmx({ config, file: "memory.tmx", cwd: dir });

    expect(result.unmatchedLanguages).toEqual([{ language: "ja", units: 1 }]);
    expect(await storedFor(dir, config, "de")).toEqual([["Save", "Speichern"]]);
  });
});
