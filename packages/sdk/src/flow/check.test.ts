import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { PROVIDER_ENV } from "@verbatra/ai-providers";
import { contentHash, type TranslationEntry } from "@verbatra/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { VerbatraConfig } from "../config/schema.js";
import {
  baseConfig,
  makeFakeFs,
  makeTempDir,
  realDiskReads,
  writeJsonFile,
} from "../test-support.js";
import { check } from "./check.js";

const cfg = (overrides: Partial<VerbatraConfig> = {}): VerbatraConfig =>
  baseConfig({ targetLocales: ["de", "fr"], format: "i18next-json", ...overrides });

async function project(
  source: Record<string, unknown>,
  targets: Record<string, Record<string, unknown> | undefined>,
): Promise<string> {
  const dir = await makeTempDir();
  await mkdir(join(dir, "locales"));
  await writeJsonFile(join(dir, "locales", "en.json"), source);
  for (const [locale, obj] of Object.entries(targets)) {
    if (obj !== undefined) {
      await writeJsonFile(join(dir, "locales", `${locale}.json`), obj);
    }
  }
  return dir;
}

function entry(value: string, placeholders: readonly string[] = []): TranslationEntry {
  return { key: "k", namespace: "en", value, placeholders, isPlural: false };
}

describe("check", () => {
  it("reports all up-to-date locales as in sync", async () => {
    const dir = await project(
      { a: "A", b: "B" },
      { de: { a: "Aa", b: "Ba" }, fr: { a: "Af", b: "Bf" } },
    );
    const summary = await check({ config: cfg(), cwd: dir });

    expect(summary.inSync).toBe(true);
    expect(summary.locales.map((l) => l.locale)).toEqual(["de", "fr"]);
    expect(summary.locales[0]).toEqual({
      locale: "de",
      missing: 0,
      stale: 0,
      upToDate: 2,
      inSync: true,
    });
    expect(summary.locales.every((l) => l.inSync)).toBe(true);
  });

  it("counts missing keys and marks the locale out of sync (missing only)", async () => {
    const dir = await project({ a: "A", b: "B" }, { de: { a: "Aa" } });
    const summary = await check({ config: cfg(), cwd: dir });

    expect(summary.inSync).toBe(false);
    expect(summary.locales[0]).toEqual({
      locale: "de",
      missing: 1,
      stale: 0,
      upToDate: 1,
      inSync: false,
    });
    expect(summary.locales[1]).toEqual({
      locale: "fr",
      missing: 2,
      stale: 0,
      upToDate: 0,
      inSync: false,
    });
  });

  it("counts stale keys whose source changed since the recorded baseline (stale only)", async () => {
    const dir = await project({ a: "A new", b: "B" }, { de: { a: "Aa", b: "Ba" } });
    await writeJsonFile(join(dir, "verbatra.lock.json"), {
      version: 1,
      locales: { de: { a: contentHash(entry("A old")), b: contentHash(entry("B")) } },
    });

    const summary = await check({ config: cfg({ targetLocales: ["de"] }), cwd: dir });

    expect(summary.inSync).toBe(false);
    expect(summary.locales[0]).toEqual({
      locale: "de",
      missing: 0,
      stale: 1,
      upToDate: 1,
      inSync: false,
    });
  });

  it("reports a mixed locale with missing, stale, and up-to-date counts together", async () => {
    const dir = await project({ a: "A new", b: "B", c: "C" }, { de: { a: "Aa", b: "Ba" } });
    await writeJsonFile(join(dir, "verbatra.lock.json"), {
      version: 1,
      locales: { de: { a: contentHash(entry("A old")), b: contentHash(entry("B")) } },
    });

    const summary = await check({ config: cfg({ targetLocales: ["de"] }), cwd: dir });

    expect(summary.locales[0]).toEqual({
      locale: "de",
      missing: 1,
      stale: 1,
      upToDate: 1,
      inSync: false,
    });
    expect(summary.inSync).toBe(false);
  });

  it("honors a valid locales subset and preserves config order", async () => {
    const dir = await project({ a: "A" }, { de: { a: "Aa" }, fr: { a: "Af" } });
    const summary = await check({
      config: cfg(),
      cwd: dir,
      locales: ["fr", "de"],
    });

    expect(summary.locales.map((l) => l.locale)).toEqual(["de", "fr"]);
    expect(summary.inSync).toBe(true);
  });

  it("rejects an unknown requested locale with UNKNOWN_LOCALE instead of silently dropping it", async () => {
    const dir = await project({ a: "A" }, { de: { a: "Aa" }, fr: { a: "Af" } });
    await expect(check({ config: cfg(), cwd: dir, locales: ["fr", "es"] })).rejects.toMatchObject({
      code: "UNKNOWN_LOCALE",
    });
  });

  it("writes nothing and never touches the lock (read-only)", async () => {
    const dir = await project({ a: "A" }, { de: { a: "Aa" } });
    const fs = makeFakeFs({
      ...realDiskReads(),
      writeFile: async () => {
        throw new Error("check must not write a file");
      },
      writeBytes: async () => {
        throw new Error("check must not write bytes");
      },
    });
    const summary = await check({ config: cfg({ targetLocales: ["de"] }), cwd: dir }, { fs });
    expect(summary.locales[0]?.locale).toBe("de");
  });

  it("throws SOURCE_UNREADABLE when the source file is absent", async () => {
    const dir = await makeTempDir();
    await expect(check({ config: cfg({ targetLocales: ["de"] }), cwd: dir })).rejects.toMatchObject(
      { code: "SOURCE_UNREADABLE" },
    );
  });

  it("throws UNKNOWN_FORMAT when no adapter is registered for the format", async () => {
    const dir = await project({ a: "A" }, { de: { a: "Aa" } });
    await expect(
      check({ config: cfg({ format: "unknown-format" as VerbatraConfig["format"] }), cwd: dir }),
    ).rejects.toMatchObject({ code: "UNKNOWN_FORMAT" });
  });

  it("throws LOCK_FILE_INVALID when the lock file is corrupt", async () => {
    const dir = await project({ a: "A" }, { de: { a: "Aa" } });
    await writeJsonFile(join(dir, "verbatra.lock.json"), "not a lock object");
    await expect(check({ config: cfg({ targetLocales: ["de"] }), cwd: dir })).rejects.toMatchObject(
      { code: "LOCK_FILE_INVALID" },
    );
  });
});

const PO_HEADER = 'msgid ""\nmsgstr "Content-Type: text/plain; charset=UTF-8\\n"\n\n';

function poFile(
  units: readonly (readonly [context: string | undefined, id: string, str: string])[],
) {
  const bodies = units.map(
    ([context, id, str]) =>
      `${context === undefined ? "" : `msgctxt "${context}"\n`}msgid "${id}"\nmsgstr "${str}"\n`,
  );
  return `${PO_HEADER}${bodies.join("\n")}`;
}

describe("check with consistency", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("omits the report unless it is asked for", async () => {
    const dir = await project(
      { a: "Save", b: "Save" },
      { de: { a: "Speichern", b: "Sichern" }, fr: { a: "Enregistrer", b: "Enregistrer" } },
    );
    const summary = await check({ config: cfg(), cwd: dir });
    expect(summary.locales[0]).not.toHaveProperty("inconsistencies");
    const explicitOff = await check({ config: cfg(), cwd: dir, consistency: false });
    expect(explicitOff.locales[0]).not.toHaveProperty("inconsistencies");
  });

  it("reports each locale's inconsistency groups and leaves the verdict and counts alone", async () => {
    const dir = await project(
      { a: "Save", b: "Save", c: "Cancel" },
      {
        de: { a: "Speichern", b: "Sichern", c: "Abbrechen" },
        fr: { a: "Enregistrer", b: "Enregistrer", c: "Annuler" },
      },
    );
    const summary = await check({ config: cfg(), cwd: dir, consistency: true });

    expect(summary.inSync).toBe(true);
    expect(summary.locales).toEqual([
      {
        locale: "de",
        missing: 0,
        stale: 0,
        upToDate: 3,
        inSync: true,
        inconsistencies: [
          {
            source: "Save",
            isPlural: false,
            translations: [
              { value: "Sichern", keys: ["b"] },
              { value: "Speichern", keys: ["a"] },
            ],
          },
        ],
      },
      { locale: "fr", missing: 0, stale: 0, upToDate: 3, inSync: true, inconsistencies: [] },
    ]);
  });

  it("does not turn an out-of-sync locale in sync or the reverse", async () => {
    const dir = await project(
      { a: "Save", b: "Save", c: "New" },
      { de: { a: "Speichern", b: "Sichern" } },
    );
    const summary = await check({
      config: cfg({ targetLocales: ["de"] }),
      cwd: dir,
      consistency: true,
    });
    expect(summary.inSync).toBe(false);
    expect(summary.locales[0]).toMatchObject({ missing: 1, upToDate: 2, inSync: false });
    expect(summary.locales[0]?.inconsistencies).toHaveLength(1);
  });

  it("compares only up-to-date keys, never a stale translation of an older source", async () => {
    const dir = await project({ a: "Save", b: "Save" }, { de: { a: "Speichern", b: "Löschen" } });
    await writeJsonFile(join(dir, "verbatra.lock.json"), {
      version: 1,
      locales: {
        de: {
          a: contentHash({ ...entry("Save"), key: "a" }),
          b: contentHash({ ...entry("Delete"), key: "b" }),
        },
      },
    });
    const summary = await check({
      config: cfg({ targetLocales: ["de"] }),
      cwd: dir,
      consistency: true,
    });
    expect(summary.locales[0]).toMatchObject({ stale: 1, upToDate: 1, inconsistencies: [] });
  });

  it("never groups gettext entries that a msgctxt disambiguates", async () => {
    const dir = await makeTempDir();
    await mkdir(join(dir, "locales"));
    await writeFile(
      join(dir, "locales", "en.po"),
      poFile([
        ["door", "open", "Open"],
        ["file", "open", "Open"],
        [undefined, "save.a", "Save"],
        [undefined, "save.b", "Save"],
      ]),
    );
    await writeFile(
      join(dir, "locales", "de.po"),
      poFile([
        ["door", "open", "Aufmachen"],
        ["file", "open", "\u00d6ffnen"],
        [undefined, "save.a", "Speichern"],
        [undefined, "save.b", "Sichern"],
      ]),
    );
    const summary = await check({
      config: cfg({
        targetLocales: ["de"],
        format: "gettext-po",
        files: { pattern: "locales/{locale}.po" },
      }),
      cwd: dir,
      consistency: true,
    });
    expect(summary.locales[0]?.upToDate).toBe(4);
    expect(summary.locales[0]?.inconsistencies).toEqual([
      {
        source: "Save",
        isPlural: false,
        translations: [
          { value: "Sichern", keys: ["save.b"] },
          { value: "Speichern", keys: ["save.a"] },
        ],
      },
    ]);
  });

  it("runs with no API key set, no network, and no file written", async () => {
    for (const name of Object.values(PROVIDER_ENV)) {
      vi.stubEnv(name, undefined);
    }
    vi.stubGlobal("fetch", () => {
      throw new Error("check must not make a network request");
    });
    const dir = await project({ a: "Save", b: "Save" }, { de: { a: "Speichern", b: "Sichern" } });
    const fs = makeFakeFs({
      ...realDiskReads(),
      writeFile: async () => {
        throw new Error("check must not write a file");
      },
      writeBytes: async () => {
        throw new Error("check must not write bytes");
      },
      createExclusive: async () => {
        throw new Error("check must not create a file");
      },
      deleteFile: async () => {
        throw new Error("check must not delete a file");
      },
    });
    const summary = await check(
      { config: cfg({ targetLocales: ["de"] }), cwd: dir, consistency: true },
      { fs },
    );
    expect(summary.locales[0]?.inconsistencies).toHaveLength(1);
  });
});
