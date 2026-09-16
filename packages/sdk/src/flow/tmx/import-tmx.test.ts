import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { contentHash } from "@verbatra/core";
import { ExchangeError } from "@verbatra/exchange";
import { describe, expect, it } from "vitest";
import { computeFingerprint } from "../../cache/fingerprint.js";
import { CACHE_FILE_NAME } from "../../cache/translation-memory.js";
import type { TranslationMemory } from "../../cache/types.js";
import type { VerbatraConfig } from "../../config/schema.js";
import { SdkError } from "../../errors.js";
import { defaultFs } from "../../fs.js";
import {
  baseConfig,
  makeFakeFs,
  makeTempDir,
  readJsonFile,
  writeJsonFile,
} from "../../test-support.js";
import { importTmx } from "./import-tmx.js";

const cfg = (overrides: Partial<VerbatraConfig> = {}): VerbatraConfig =>
  baseConfig({
    sourceLocale: "en",
    targetLocales: ["de", "fr"],
    format: "i18next-json",
    ...overrides,
  });

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

function tu(pairs: ReadonlyArray<readonly [string, string]>): string {
  return `    <tu>\n${pairs
    .map(([lang, seg]) => `      <tuv xml:lang="${lang}"><seg>${seg}</seg></tuv>`)
    .join("\n")}\n    </tu>`;
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

function entryHash(value: string, placeholders: readonly string[] = []): string {
  return contentHash({ key: "tmx", namespace: "", value, placeholders, isPlural: false });
}

function bucket(memory: TranslationMemory, config: VerbatraConfig, locale: string) {
  return memory.entries[computeFingerprint(config)]?.[locale] ?? {};
}

describe("importTmx lands units in the translation memory", () => {
  it("stores one entry per source and locale, keyed the way a run keys it", async () => {
    const config = cfg();
    const dir = await project([
      tu([
        ["en", "Hello"],
        ["de", "Hallo"],
        ["fr", "Bonjour"],
      ]),
    ]);

    const result = await importTmx({ config, file: "memory.tmx", cwd: dir });

    expect(result.units).toBe(1);
    expect(result.locales).toEqual([
      expect.objectContaining({ locale: "de", added: 1, kept: 0, unchanged: 0 }),
      expect.objectContaining({ locale: "fr", added: 1 }),
    ]);
    const memory = await memoryOf(dir);
    expect(bucket(memory, config, "de")).toEqual({ [entryHash("Hello")]: "Hallo" });
    expect(bucket(memory, config, "fr")).toEqual({ [entryHash("Hello")]: "Bonjour" });
  });

  it("records the source text beside the entry, which is what an export needs", async () => {
    const dir = await project([
      tu([
        ["en", "Hello"],
        ["de", "Hallo"],
      ]),
    ]);

    await importTmx({ config: cfg(), file: "memory.tmx", cwd: dir });

    expect((await memoryOf(dir)).sources).toEqual({ [entryHash("Hello")]: "Hello" });
  });

  it("writes nothing on a dry run but reports what it would have stored", async () => {
    const dir = await project([
      tu([
        ["en", "Hello"],
        ["de", "Hallo"],
      ]),
    ]);

    const result = await importTmx({ config: cfg(), file: "memory.tmx", cwd: dir, dryRun: true });

    expect(result.dryRun).toBe(true);
    expect(result.locales[0]?.added).toBe(1);
    await expect(readFile(join(dir, CACHE_FILE_NAME), "utf8")).rejects.toThrow();
  });

  it("reports the header source language it found", async () => {
    const dir = await project([tu([["en-US", "Hello"]])], "en-US");

    expect((await importTmx({ config: cfg(), file: "memory.tmx", cwd: dir })).sourceLanguage).toBe(
      "en-US",
    );
  });

  it("imports only the requested subset of target locales", async () => {
    const config = cfg();
    const dir = await project([
      tu([
        ["en", "Hello"],
        ["de", "Hallo"],
        ["fr", "Bonjour"],
      ]),
    ]);

    const result = await importTmx({
      config,
      file: "memory.tmx",
      cwd: dir,
      locales: ["de"],
    });

    expect(result.locales.map((each) => each.locale)).toEqual(["de"]);
    expect(bucket(await memoryOf(dir), config, "fr")).toEqual({});
  });

  it("counts a configured locale the run filtered out rather than dropping it silently", async () => {
    const config = cfg();
    const dir = await project([
      tu([
        ["en", "Hello"],
        ["de", "Hallo"],
        ["fr", "Bonjour"],
      ]),
      tu([
        ["en", "Goodbye"],
        ["fr", "Au revoir"],
      ]),
    ]);

    const result = await importTmx({ config, file: "memory.tmx", cwd: dir, locales: ["de"] });

    expect(result.notImported).toEqual([{ language: "fr", units: 2 }]);
    expect(result.unmatchedLanguages).toEqual([]);
    expect(result.ambiguousLanguages).toEqual([]);
  });

  it("counts a filtered locale on a unit whose source segment is blank", async () => {
    const dir = await project([
      tu([
        ["en", "   "],
        ["de", "Hallo"],
        ["fr", "Bonjour"],
      ]),
    ]);

    const result = await importTmx({
      config: cfg(),
      file: "memory.tmx",
      cwd: dir,
      locales: ["de"],
    });

    expect(result.locales[0]?.rejected.sourceBlank).toBe(1);
    expect(result.notImported).toEqual([{ language: "fr", units: 1 }]);
  });

  it("counts a filtered locale on a unit whose source segments conflict", async () => {
    const dir = await project([
      tu([
        ["en-US", "Color"],
        ["en-GB", "Colour"],
        ["de", "Farbe"],
        ["fr", "Couleur"],
      ]),
    ]);

    const result = await importTmx({
      config: cfg(),
      file: "memory.tmx",
      cwd: dir,
      locales: ["de"],
    });

    expect(result.conflictingSourceUnits).toBe(1);
    expect(result.notImported).toEqual([{ language: "fr", units: 1 }]);
  });

  it("reports nothing as not-imported when the run covers every configured locale", async () => {
    const dir = await project([
      tu([
        ["en", "Hello"],
        ["de", "Hallo"],
        ["fr", "Bonjour"],
      ]),
    ]);

    expect((await importTmx({ config: cfg(), file: "memory.tmx", cwd: dir })).notImported).toEqual(
      [],
    );
  });

  it("refuses a locale that is not configured", async () => {
    const dir = await project([tu([["en", "Hello"]])]);

    await expect(
      importTmx({ config: cfg(), file: "memory.tmx", cwd: dir, locales: ["ja"] }),
    ).rejects.toThrow(SdkError);
  });
});

describe("importTmx matches language tags by an explicit rule", () => {
  it("matches a regional tag onto the configured bare locale", async () => {
    const config = cfg();
    const dir = await project(
      [
        tu([
          ["en-US", "Hello"],
          ["de-DE", "Hallo"],
        ]),
      ],
      "en-US",
    );

    await importTmx({ config, file: "memory.tmx", cwd: dir });

    expect(bucket(await memoryOf(dir), config, "de")).toEqual({ [entryHash("Hello")]: "Hallo" });
  });

  it("matches an underscore-spelled tag onto the hyphen-spelled configured locale", async () => {
    const config = cfg({ targetLocales: ["pt-BR"] });
    const dir = await project([
      tu([
        ["en", "Hello"],
        ["pt_BR", "Olá"],
      ]),
    ]);

    await importTmx({ config, file: "memory.tmx", cwd: dir });

    expect(bucket(await memoryOf(dir), config, "pt-BR")).toEqual({ [entryHash("Hello")]: "Olá" });
  });

  it("counts a language no configured locale claims instead of dropping it silently", async () => {
    const dir = await project([
      tu([
        ["en", "Hello"],
        ["ja", "こんにちは"],
        ["de", "Hallo"],
      ]),
      tu([
        ["en", "Goodbye"],
        ["ja", "さようなら"],
      ]),
    ]);

    const result = await importTmx({ config: cfg(), file: "memory.tmx", cwd: dir });

    expect(result.unmatchedLanguages).toEqual([{ language: "ja", units: 2 }]);
  });

  it("orders several unmatched languages by tag, so the report is stable", async () => {
    const dir = await project([
      tu([
        ["en", "Hello"],
        ["ko", "안녕하세요"],
        ["ja", "こんにちは"],
        ["it", "Ciao"],
      ]),
    ]);

    const result = await importTmx({ config: cfg(), file: "memory.tmx", cwd: dir });

    expect(result.unmatchedLanguages.map((each) => each.language)).toEqual(["it", "ja", "ko"]);
  });

  it("reports a tag two configured locales could claim rather than guessing", async () => {
    const dir = await project([
      tu([
        ["en", "Hello"],
        ["pt", "Olá"],
      ]),
    ]);

    const result = await importTmx({
      config: cfg({ targetLocales: ["pt-BR", "pt-AO"] }),
      file: "memory.tmx",
      cwd: dir,
    });

    expect(result.ambiguousLanguages).toEqual([{ language: "pt", units: 1 }]);
    expect(result.locales.every((locale) => locale.added === 0)).toBe(true);
  });

  it("counts a unit with no segment in the source locale rather than keying it wrongly", async () => {
    const dir = await project([
      tu([
        ["de", "Hallo"],
        ["fr", "Bonjour"],
      ]),
    ]);

    const result = await importTmx({ config: cfg(), file: "memory.tmx", cwd: dir });

    expect(result.unmatchedSourceUnits).toBe(1);
    expect(result.locales.every((locale) => locale.added === 0)).toBe(true);
  });
});

describe("importTmx never lets one segment stand in for two locales", () => {
  it("does not swallow a regional target as the bare source locale", async () => {
    const config = cfg({ sourceLocale: "pt", targetLocales: ["pt-BR", "de"] });
    const dir = await project([
      tu([
        ["pt", "SOURCE-pt"],
        ["pt-BR", "TARGET-ptBR"],
        ["de", "TARGET-de"],
      ]),
    ]);

    const result = await importTmx({ config, file: "memory.tmx", cwd: dir });

    const memory = await memoryOf(dir);
    expect(memory.sources).toEqual({ [entryHash("SOURCE-pt")]: "SOURCE-pt" });
    expect(bucket(memory, config, "pt-BR")).toEqual({ [entryHash("SOURCE-pt")]: "TARGET-ptBR" });
    expect(bucket(memory, config, "de")).toEqual({ [entryHash("SOURCE-pt")]: "TARGET-de" });
    expect(result.locales.map((each) => [each.locale, each.added])).toEqual([
      ["pt-BR", 1],
      ["de", 1],
    ]);
  });

  it("does the same for two regional variants of the bare source locale", async () => {
    const config = cfg({ sourceLocale: "en", targetLocales: ["en-GB", "de"] });
    const dir = await project([
      tu([
        ["en", "Color"],
        ["en-GB", "Colour"],
        ["de", "Farbe"],
      ]),
    ]);

    await importTmx({ config, file: "memory.tmx", cwd: dir });

    const memory = await memoryOf(dir);
    expect(memory.sources).toEqual({ [entryHash("Color")]: "Color" });
    expect(bucket(memory, config, "en-GB")).toEqual({ [entryHash("Color")]: "Colour" });
  });

  it("resolves a target against every configured locale even when the run imports a subset", async () => {
    const config = cfg({ sourceLocale: "pt", targetLocales: ["pt-BR", "de"] });
    const dir = await project([
      tu([
        ["pt", "SOURCE-pt"],
        ["pt-BR", "TARGET-ptBR"],
        ["de", "TARGET-de"],
      ]),
    ]);

    await importTmx({ config, file: "memory.tmx", cwd: dir, locales: ["de"] });

    const memory = await memoryOf(dir);
    expect(memory.sources).toEqual({ [entryHash("SOURCE-pt")]: "SOURCE-pt" });
    expect(bucket(memory, config, "de")).toEqual({ [entryHash("SOURCE-pt")]: "TARGET-de" });
  });

  it("does not refuse a unit whose exact and prefix source segments carry the same value", async () => {
    const config = cfg({ sourceLocale: "en", targetLocales: ["de"] });
    const dir = await project([
      tu([
        ["en", "Save"],
        ["en-US", "Save"],
        ["de", "Speichern"],
      ]),
    ]);

    const result = await importTmx({ config, file: "memory.tmx", cwd: dir });

    expect(result.conflictingSourceUnits).toBe(0);
    expect(result.locales[0]?.added).toBe(1);
    expect(bucket(await memoryOf(dir), config, "de")).toEqual({
      [entryHash("Save")]: "Speichern",
    });
  });

  it("takes the exact source segment over a prefix one carrying a different value", async () => {
    const config = cfg({ sourceLocale: "en", targetLocales: ["de"] });
    const dir = await project([
      tu([
        ["en-GB", "Colour"],
        ["en", "Color"],
        ["de", "Farbe"],
      ]),
    ]);

    const result = await importTmx({ config, file: "memory.tmx", cwd: dir });

    expect(result.conflictingSourceUnits).toBe(0);
    expect(bucket(await memoryOf(dir), config, "de")).toEqual({
      [entryHash("Color")]: "Farbe",
    });
  });

  it("does not refuse a unit whose two prefix source segments carry the same value", async () => {
    const config = cfg({ sourceLocale: "en", targetLocales: ["de"] });
    const dir = await project([
      tu([
        ["en-US", "Save"],
        ["en-GB", "Save"],
        ["de", "Speichern"],
      ]),
    ]);

    const result = await importTmx({ config, file: "memory.tmx", cwd: dir });

    expect(result.conflictingSourceUnits).toBe(0);
    expect(result.locales[0]?.added).toBe(1);
  });

  it("refuses a unit whose two equal-ranked source segments carry different values", async () => {
    const config = cfg({ sourceLocale: "en", targetLocales: ["de"] });
    const dir = await project([
      tu([
        ["en-US", "Color"],
        ["en-GB", "Colour"],
        ["de", "Farbe"],
      ]),
    ]);

    const result = await importTmx({ config, file: "memory.tmx", cwd: dir });

    expect(result.conflictingSourceUnits).toBe(1);
    expect(result.locales[0]?.added).toBe(0);
    expect(bucket(await memoryOf(dir), config, "de")).toEqual({});
  });

  it("refuses a config whose source and a target are the same tag once normalized", async () => {
    const dir = await project([tu([["en", "Hello"]])]);

    await expect(
      importTmx({
        config: cfg({ sourceLocale: "pt-BR", targetLocales: ["pt_BR"] }),
        file: "memory.tmx",
        cwd: dir,
      }),
    ).rejects.toMatchObject({ code: "CONFIG_INVALID" });
  });

  it("reports a header source language that is not the configured source locale", async () => {
    const dir = await project([tu([["de", "Hallo"]])], "fr-FR");

    const result = await importTmx({ config: cfg(), file: "memory.tmx", cwd: dir });

    expect(result.sourceLanguageMismatch).toBe("fr-FR");
  });

  it("treats the TMX all-languages wildcard as no mismatch", async () => {
    const dir = await project([tu([["en", "Hello"]])], "*all*");

    expect(
      (await importTmx({ config: cfg(), file: "memory.tmx", cwd: dir })).sourceLanguageMismatch,
    ).toBeUndefined();
  });

  it("reports no mismatch when the header spells the source locale differently", async () => {
    const dir = await project([tu([["en-US", "Hello"]])], "en-US");

    expect(
      (await importTmx({ config: cfg(), file: "memory.tmx", cwd: dir })).sourceLanguageMismatch,
    ).toBeUndefined();
  });
});

describe("importTmx never lets the last of two target segments silently win", () => {
  it("prefers the exact tag over a segment that only reaches the locale by prefix", async () => {
    const config = cfg({ sourceLocale: "en", targetLocales: ["de"] });
    const dir = await project([
      tu([
        ["en", "Street"],
        ["de", "Straße"],
        ["de-CH", "Strasse"],
      ]),
    ]);

    const result = await importTmx({ config, file: "memory.tmx", cwd: dir });

    expect(result.locales[0]).toEqual(expect.objectContaining({ added: 1, conflicting: 0 }));
    expect(bucket(await memoryOf(dir), config, "de")).toEqual({ [entryHash("Street")]: "Straße" });
  });

  it("prefers the exact tag even when the prefix segment comes first", async () => {
    const config = cfg({ sourceLocale: "en", targetLocales: ["de"] });
    const dir = await project([
      tu([
        ["en", "Street"],
        ["de-CH", "Strasse"],
        ["de", "Straße"],
      ]),
    ]);

    await importTmx({ config, file: "memory.tmx", cwd: dir });

    expect(bucket(await memoryOf(dir), config, "de")).toEqual({ [entryHash("Street")]: "Straße" });
  });

  it("stores nothing and counts a conflict when two prefix segments disagree", async () => {
    const config = cfg({ sourceLocale: "en", targetLocales: ["de"] });
    const dir = await project([
      tu([
        ["en", "Street"],
        ["de-CH", "Strasse"],
        ["de-AT", "Straße"],
      ]),
      tu([
        ["en", "Save"],
        ["de", "Speichern"],
      ]),
    ]);

    const result = await importTmx({ config, file: "memory.tmx", cwd: dir });

    expect(result.locales[0]).toEqual(expect.objectContaining({ added: 1, conflicting: 1 }));
    expect(bucket(await memoryOf(dir), config, "de")).toEqual({
      [entryHash("Save")]: "Speichern",
    });
  });

  it("stores nothing and counts a conflict when two exact segments disagree", async () => {
    const config = cfg({ sourceLocale: "en", targetLocales: ["de"] });
    const dir = await project([
      tu([
        ["en", "Street"],
        ["de", "Straße"],
        ["DE", "Strasse"],
      ]),
    ]);

    const result = await importTmx({ config, file: "memory.tmx", cwd: dir });

    expect(result.locales[0]).toEqual(expect.objectContaining({ added: 0, conflicting: 1 }));
    expect(bucket(await memoryOf(dir), config, "de")).toEqual({});
  });

  it("lets an exact segment settle a conflict between two prefix segments", async () => {
    const config = cfg({ sourceLocale: "en", targetLocales: ["de"] });
    const dir = await project([
      tu([
        ["en", "Street"],
        ["de-CH", "Strasse"],
        ["de-AT", "Gasse"],
        ["de", "Straße"],
      ]),
    ]);

    const result = await importTmx({ config, file: "memory.tmx", cwd: dir });

    expect(result.locales[0]).toEqual(expect.objectContaining({ added: 1, conflicting: 0 }));
    expect(bucket(await memoryOf(dir), config, "de")).toEqual({ [entryHash("Street")]: "Straße" });
  });

  it("does not treat two segments carrying the same value as a conflict", async () => {
    const config = cfg({ sourceLocale: "en", targetLocales: ["de"] });
    const dir = await project([
      tu([
        ["en", "Street"],
        ["de-CH", "Strasse"],
        ["de-LI", "Strasse"],
      ]),
    ]);

    const result = await importTmx({ config, file: "memory.tmx", cwd: dir });

    expect(result.locales[0]).toEqual(expect.objectContaining({ added: 1, conflicting: 0 }));
    expect(bucket(await memoryOf(dir), config, "de")).toEqual({ [entryHash("Street")]: "Strasse" });
  });

  it("keeps the conflict to its own locale and stores the other locales of the unit", async () => {
    const config = cfg({ sourceLocale: "en", targetLocales: ["de", "fr"] });
    const dir = await project([
      tu([
        ["en", "Street"],
        ["de-CH", "Strasse"],
        ["de-AT", "Straße"],
        ["fr", "Rue"],
      ]),
    ]);

    const result = await importTmx({ config, file: "memory.tmx", cwd: dir });

    expect(result.locales.map((each) => [each.locale, each.added, each.conflicting])).toEqual([
      ["de", 0, 1],
      ["fr", 1, 0],
    ]);
  });

  it("counts a conflicted locale the run filtered out as not imported", async () => {
    const config = cfg({ sourceLocale: "en", targetLocales: ["de", "fr"] });
    const dir = await project([
      tu([
        ["en", "Street"],
        ["de-CH", "Strasse"],
        ["de-AT", "Straße"],
        ["fr", "Rue"],
      ]),
    ]);

    const result = await importTmx({ config, file: "memory.tmx", cwd: dir, locales: ["fr"] });

    expect(result.notImported).toEqual([{ language: "de", units: 1 }]);
    expect(result.locales).toEqual([expect.objectContaining({ locale: "fr", conflicting: 0 })]);
  });

  it("refuses a conflicted locale on a blank-source unit as a blank source", async () => {
    const config = cfg({ sourceLocale: "en", targetLocales: ["de"] });
    const dir = await project([
      tu([
        ["en", " "],
        ["de-CH", "Strasse"],
        ["de-AT", "Straße"],
      ]),
    ]);

    const result = await importTmx({ config, file: "memory.tmx", cwd: dir });

    expect(result.locales[0]).toEqual(expect.objectContaining({ conflicting: 0 }));
    expect(result.locales[0]?.rejected.sourceBlank).toBe(1);
  });
});

describe("importTmx feeds the fuzzy corpus, which no import-time gate can police", () => {
  it("stores the imported source text into the block fuzzy matching scores against", async () => {
    const config = cfg();
    const dir = await project([
      tu([
        ["en", "Save the document"],
        ["de", "Dokument speichern"],
      ]),
    ]);

    await importTmx({ config, file: "memory.tmx", cwd: dir });

    expect((await memoryOf(dir)).sources).toEqual({
      [entryHash("Save the document")]: "Save the document",
    });
  });

  it("is an exact miss for a source the project spells with an invisible difference", async () => {
    const config = cfg();
    const dir = await project([
      tu([
        ["en", `Save the document${"\u200b"}`],
        ["de", "Dokument speichern"],
      ]),
    ]);

    await importTmx({ config, file: "memory.tmx", cwd: dir });

    const memory = await memoryOf(dir);
    expect(Object.keys(bucket(memory, config, "de"))).not.toContain(entryHash("Save the document"));
  });

  it("is an exact miss for a project entry whose hash covers a description a unit cannot carry", async () => {
    const config = cfg();
    const dir = await project([
      tu([
        ["en", "Save"],
        ["de", "Speichern"],
      ]),
    ]);

    await importTmx({ config, file: "memory.tmx", cwd: dir });

    const described = contentHash({
      key: "k",
      namespace: "",
      value: "Save",
      placeholders: [],
      isPlural: false,
      description: "toolbar button",
    });
    expect(Object.keys(bucket(await memoryOf(dir), config, "de"))).not.toContain(described);
  });
});

describe("importTmx holds an imported unit to the same gate a provider's output faces", () => {
  it("refuses a translation that drops a placeholder the source carries", async () => {
    const config = cfg();
    const dir = await project([
      tu([
        ["en", "Hello {{name}}"],
        ["de", "Hallo"],
      ]),
    ]);

    const result = await importTmx({ config, file: "memory.tmx", cwd: dir });

    expect(result.locales[0]?.rejected.placeholder).toBe(1);
    expect(bucket(await memoryOf(dir), config, "de")).toEqual({});
  });

  it("refuses a translation that invents a placeholder the source never had", async () => {
    const dir = await project([
      tu([
        ["en", "Hello"],
        ["de", "Hallo {{name}}"],
      ]),
    ]);

    const result = await importTmx({ config: cfg(), file: "memory.tmx", cwd: dir });

    expect(result.locales[0]?.rejected.placeholder).toBe(1);
  });

  it("refuses a translation that is not a valid ICU message", async () => {
    const dir = await project([
      tu([
        ["en", "Save the document"],
        ["de", "Dokument speichern {"],
      ]),
    ]);

    const result = await importTmx({
      config: cfg({ format: "next-intl-json" }),
      file: "memory.tmx",
      cwd: dir,
    });

    expect(result.locales[0]?.rejected.icu).toBe(1);
  });

  it("refuses a blank translation of a source that has text", async () => {
    const dir = await project([
      tu([
        ["en", "Hello"],
        ["de", ""],
      ]),
    ]);

    const result = await importTmx({ config: cfg(), file: "memory.tmx", cwd: dir });

    expect(result.locales[0]?.rejected.empty).toBe(1);
  });

  it("refuses a translation that collapsed into runaway output", async () => {
    const dir = await project([
      tu([
        ["en", "Save the current document now"],
        ["de", "Speichern ".repeat(60)],
      ]),
    ]);

    const result = await importTmx({ config: cfg(), file: "memory.tmx", cwd: dir });

    expect(result.locales[0]?.rejected.degenerate).toBe(1);
  });

  it("refuses a unit whose source segment is blank, because it identifies no string", async () => {
    const config = cfg();
    const dir = await project([
      tu([
        ["en", "   "],
        ["de", "Hallo"],
      ]),
    ]);

    const result = await importTmx({ config, file: "memory.tmx", cwd: dir });

    expect(result.locales[0]?.rejected.sourceBlank).toBe(1);
    expect(bucket(await memoryOf(dir), config, "de")).toEqual({});
  });

  it("stores a unit whose placeholders do match", async () => {
    const config = cfg();
    const dir = await project([
      tu([
        ["en", "Hello {{name}}"],
        ["de", "Hallo {{name}}"],
      ]),
    ]);

    await importTmx({ config, file: "memory.tmx", cwd: dir });

    expect(bucket(await memoryOf(dir), config, "de")).toEqual({
      [entryHash("Hello {{name}}", ["{{name}}"])]: "Hallo {{name}}",
    });
  });
});

describe("importTmx is idempotent and decides collisions explicitly", () => {
  async function importTwice(dir: string, config: VerbatraConfig) {
    await importTmx({ config, file: "memory.tmx", cwd: dir });
    const before = await readFile(join(dir, CACHE_FILE_NAME), "utf8");
    const second = await importTmx({ config, file: "memory.tmx", cwd: dir });
    return { before, after: await readFile(join(dir, CACHE_FILE_NAME), "utf8"), second };
  }

  it("changes nothing on a second import of the same file", async () => {
    const config = cfg();
    const dir = await project([
      tu([
        ["en", "Hello"],
        ["de", "Hallo"],
      ]),
    ]);

    const { before, after, second } = await importTwice(dir, config);

    expect(after).toBe(before);
    expect(second.locales[0]).toEqual(
      expect.objectContaining({ added: 0, unchanged: 1, overwritten: 0, kept: 0 }),
    );
  });

  it("writes nothing at all on a second import, not even the same bytes again", async () => {
    const config = cfg();
    const dir = await project([
      tu([
        ["en", "Hello"],
        ["de", "Hallo"],
      ]),
    ]);
    await importTmx({ config, file: "memory.tmx", cwd: dir });

    const writes: string[] = [];
    const spy = makeFakeFs({
      readFileBounded: (path: string, maxBytes: number) =>
        defaultFs.readFileBounded(path, maxBytes),
      writeFile: async (path: string, data: string): Promise<void> => {
        writes.push(path);
        await defaultFs.writeFile(path, data);
      },
    });

    await importTmx({ config, file: "memory.tmx", cwd: dir }, { fs: spy });

    expect(writes).toEqual([]);
  });

  it("does write through that same spy when there is something new to store", async () => {
    const config = cfg();
    const dir = await project([
      tu([
        ["en", "Hello"],
        ["de", "Hallo"],
      ]),
    ]);

    const writes: string[] = [];
    const spy = makeFakeFs({
      readFileBounded: (path: string, maxBytes: number) =>
        defaultFs.readFileBounded(path, maxBytes),
      writeFile: async (path: string, data: string): Promise<void> => {
        writes.push(path);
        await defaultFs.writeFile(path, data);
      },
    });

    await importTmx({ config, file: "memory.tmx", cwd: dir }, { fs: spy });

    expect(writes).toEqual([join(dir, CACHE_FILE_NAME)]);
  });

  it("keeps the translation already in the memory when the file disagrees", async () => {
    const config = cfg();
    const dir = await project([
      tu([
        ["en", "Hello"],
        ["de", "Moin"],
      ]),
    ]);
    await writeJsonFile(join(dir, CACHE_FILE_NAME), {
      version: 2,
      entries: { [computeFingerprint(config)]: { de: { [entryHash("Hello")]: "Hallo" } } },
      sources: { [entryHash("Hello")]: "Hello" },
    });

    const result = await importTmx({ config, file: "memory.tmx", cwd: dir });

    expect(result.locales[0]).toEqual(
      expect.objectContaining({ kept: 1, overwritten: 0, added: 0 }),
    );
    expect(bucket(await memoryOf(dir), config, "de")).toEqual({ [entryHash("Hello")]: "Hallo" });
  });

  it("replaces the existing translation only when overwrite is asked for", async () => {
    const config = cfg();
    const dir = await project([
      tu([
        ["en", "Hello"],
        ["de", "Moin"],
      ]),
    ]);
    await writeJsonFile(join(dir, CACHE_FILE_NAME), {
      version: 2,
      entries: { [computeFingerprint(config)]: { de: { [entryHash("Hello")]: "Hallo" } } },
      sources: { [entryHash("Hello")]: "Hello" },
    });

    const result = await importTmx({ config, file: "memory.tmx", cwd: dir, overwrite: true });

    expect(result.locales[0]).toEqual(expect.objectContaining({ overwritten: 1, kept: 0 }));
    expect(bucket(await memoryOf(dir), config, "de")).toEqual({ [entryHash("Hello")]: "Moin" });
  });

  it("lets the first of two units with the same source win and counts the rest", async () => {
    const config = cfg();
    const dir = await project([
      tu([
        ["en", "Hello"],
        ["de", "Hallo"],
      ]),
      tu([
        ["en", "Hello"],
        ["de", "Moin"],
      ]),
    ]);

    const result = await importTmx({ config, file: "memory.tmx", cwd: dir });

    expect(result.locales[0]).toEqual(expect.objectContaining({ added: 1, duplicates: 1 }));
    expect(bucket(await memoryOf(dir), config, "de")).toEqual({ [entryHash("Hello")]: "Hallo" });
  });

  it("leaves a memory that already holds the translation completely alone, source block included", async () => {
    const config = cfg();
    const dir = await project([
      tu([
        ["en", "Hello"],
        ["de", "Hallo"],
      ]),
    ]);
    await writeJsonFile(join(dir, CACHE_FILE_NAME), {
      version: 2,
      entries: { [computeFingerprint(config)]: { de: { [entryHash("Hello")]: "Hallo" } } },
      sources: {},
    });

    const before = await readFile(join(dir, CACHE_FILE_NAME), "utf8");

    const result = await importTmx({ config, file: "memory.tmx", cwd: dir });

    expect(result.locales[0]?.unchanged).toBe(1);
    expect(await readFile(join(dir, CACHE_FILE_NAME), "utf8")).toBe(before);
  });

  it("stores nothing under a fingerprint the config no longer produces", async () => {
    const config = cfg();
    const dir = await project([
      tu([
        ["en", "Hello"],
        ["de", "Hallo"],
      ]),
    ]);

    await importTmx({ config, file: "memory.tmx", cwd: dir });

    const otherTone = cfg({ tone: "formal" });
    expect(bucket(await memoryOf(dir), otherTone, "de")).toEqual({});
  });
});

describe("importTmx refuses to touch a memory it cannot safely write", () => {
  it("leaves a cache written by a newer build alone and says so", async () => {
    const config = cfg();
    const dir = await project([
      tu([
        ["en", "Hello"],
        ["de", "Hallo"],
      ]),
    ]);
    const newer = { version: 99, entries: {}, sources: {} };
    await writeJsonFile(join(dir, CACHE_FILE_NAME), newer);

    const result = await importTmx({ config, file: "memory.tmx", cwd: dir });

    expect(result.memoryWritable).toBe(false);
    expect(await readJsonFile(join(dir, CACHE_FILE_NAME))).toEqual(newer);
  });
});

describe("importTmx reports an unusable file as a structured error", () => {
  it("names a missing file", async () => {
    const dir = await project([]);

    await expect(importTmx({ config: cfg(), file: "absent.tmx", cwd: dir })).rejects.toMatchObject({
      code: "SOURCE_UNREADABLE",
    });
  });

  it("names a malformed file rather than leaking a parser error", async () => {
    const dir = await project([]);
    await writeFile(join(dir, "memory.tmx"), '<tmx version="1.4"><body><tu', "utf8");

    await expect(importTmx({ config: cfg(), file: "memory.tmx", cwd: dir })).rejects.toMatchObject({
      code: "SOURCE_INVALID",
    });
  });

  it("says where a malformed file went wrong, in the message and on the wrapped cause", async () => {
    const dir = await project([]);
    const file = join(dir, "memory.tmx");
    await writeFile(
      file,
      tmxDocument([
        tu([
          ["en", "Save"],
          ["de", "Speichern"],
        ]),
        '    <tu>\n      <tuv xml:lang="en"><seg>Cancel</tuv>\n    </tu>',
      ]),
      "utf8",
    );

    const error = await importTmx({ config: cfg(), file: "memory.tmx", cwd: dir }).catch(
      (thrown: unknown) => thrown,
    );

    expect(error).toBeInstanceOf(SdkError);
    expect((error as SdkError).code).toBe("SOURCE_INVALID");
    expect((error as SdkError).message).toContain(file);
    expect((error as SdkError).message).toContain("line 10, column 31, unit 2");
    expect((error as SdkError).cause).toBeInstanceOf(ExchangeError);
    expect(((error as SdkError).cause as ExchangeError).location).toEqual({
      line: 10,
      column: 31,
      unit: 2,
    });
  });

  it("refuses a file that declares an XML entity", async () => {
    const dir = await project([]);
    await writeFile(
      join(dir, "memory.tmx"),
      '<!DOCTYPE tmx [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><tmx version="1.4"><body/></tmx>',
      "utf8",
    );

    await expect(importTmx({ config: cfg(), file: "memory.tmx", cwd: dir })).rejects.toMatchObject({
      code: "SOURCE_INVALID",
      message: expect.stringContaining("entity"),
    });
  });

  it("names an oversized file rather than reading it", async () => {
    const dir = await project([]);
    const fs = makeFakeFs({
      readFileBounded: async (path: string) =>
        path.endsWith(".tmx") ? { kind: "too-large" as const } : defaultFs.readFileBounded(path, 1),
    });

    await expect(
      importTmx({ config: cfg(), file: "memory.tmx", cwd: dir }, { fs }),
    ).rejects.toMatchObject({ code: "SOURCE_INVALID" });
  });

  it("counts a unit the reader could not use at all", async () => {
    const dir = await project(['    <tu><tuv xml:lang="en"></tuv></tu>']);

    const result = await importTmx({ config: cfg(), file: "memory.tmx", cwd: dir });

    expect(result.skippedUnits).toBe(1);
    expect(result.units).toBe(0);
  });

  it("counts a unit whose inline markup was flattened", async () => {
    const dir = await project([
      '    <tu>\n      <tuv xml:lang="en"><seg>Hello <ph>x</ph></seg></tuv>\n      <tuv xml:lang="de"><seg>Hallo x</seg></tuv>\n    </tu>',
    ]);

    const result = await importTmx({ config: cfg(), file: "memory.tmx", cwd: dir });

    expect(result.markupStrippedUnits).toBe(1);
  });

  it("counts a unit whose inline markup carried sub-flow text it left out", async () => {
    const dir = await project([
      '    <tu>\n      <tuv xml:lang="en"><seg>Open <ph>&lt;a title="<sub>Tip</sub>"&gt;</ph>it</seg></tuv>\n      <tuv xml:lang="de"><seg>Oeffne <ph>&lt;a title="<sub>Hinweis</sub>"&gt;</ph>es</seg></tuv>\n    </tu>',
      tu([
        ["en", "Save"],
        ["de", "Speichern"],
      ]),
    ]);
    const config = cfg();

    const result = await importTmx({ config, file: "memory.tmx", cwd: dir });

    expect(result.subflowDroppedUnits).toBe(1);
    expect(result.markupStrippedUnits).toBe(1);
    expect(bucket(await memoryOf(dir), config, "de")[entryHash('Open <a title="">it')]).toBe(
      'Oeffne <a title="">es',
    );
  });
});
