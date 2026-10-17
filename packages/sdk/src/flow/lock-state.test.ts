import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { contentHash, type TranslationEntry } from "@verbatra/core";
import { describe, expect, it } from "vitest";
import type { VerbatraConfig } from "../config/schema.js";
import {
  baseConfig,
  makeFakeFs,
  makeTempDir,
  realDiskReads,
  writeJsonFile,
} from "../test-support.js";
import { lockState } from "./lock-state.js";

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

describe("lockState", () => {
  it("reports exists: false when no lock-file is on disk", async () => {
    const dir = await project({ a: "A" }, { de: { a: "Aa" }, fr: { a: "Af" } });
    const result = await lockState({ config: cfg(), cwd: dir });
    expect(result).toEqual({ exists: false });
  });

  it("defaults cwd to process.cwd() when omitted", async () => {
    const result = await lockState({ config: cfg() });
    expect(result.exists).toBe(false);
  });

  it("reports exists: false without reading the source file when the source is also absent", async () => {
    const dir = await makeTempDir();
    const result = await lockState({ config: cfg({ targetLocales: ["de"] }), cwd: dir });
    expect(result).toEqual({ exists: false });
  });

  it("distinguishes an empty but present lock-file from a missing one", async () => {
    const dir = await project({ a: "A", b: "B" }, { de: { a: "Aa", b: "Ba" } });
    await writeJsonFile(join(dir, "verbatra.lock.json"), { version: 1, locales: {} });

    const result = await lockState({ config: cfg({ targetLocales: ["de"] }), cwd: dir });

    expect(result.exists).toBe(true);
    if (!result.exists) {
      throw new Error("expected exists: true");
    }
    expect(result.version).toBe(1);
    expect(result.locales).toMatchObject([
      { locale: "de", keyCount: 0, missing: 0, stale: 0, upToDate: 2 },
    ]);
  });

  it("reports per-locale key counts from the recorded baseline, not from the target file", async () => {
    const dir = await project({ a: "A", b: "B" }, { de: { a: "Aa", b: "Ba" } });
    await writeJsonFile(join(dir, "verbatra.lock.json"), {
      version: 1,
      locales: { de: { a: contentHash(entry("A")) } },
    });

    const result = await lockState({ config: cfg({ targetLocales: ["de"] }), cwd: dir });

    expect(result.exists).toBe(true);
    if (!result.exists) {
      throw new Error("expected exists: true");
    }
    expect(result.locales).toMatchObject([
      { locale: "de", keyCount: 1, missing: 0, stale: 0, upToDate: 2 },
    ]);
  });

  it("reports drift metrics: missing, stale, and up-to-date counts against source and target", async () => {
    const dir = await project({ a: "A new", b: "B", c: "C" }, { de: { a: "Aa", b: "Ba" } });
    await writeJsonFile(join(dir, "verbatra.lock.json"), {
      version: 1,
      locales: { de: { a: contentHash(entry("A old")), b: contentHash(entry("B")) } },
    });

    const result = await lockState({ config: cfg({ targetLocales: ["de"] }), cwd: dir });

    expect(result.exists).toBe(true);
    if (!result.exists) {
      throw new Error("expected exists: true");
    }
    expect(result.version).toBe(1);
    expect(result.locales).toMatchObject([
      { locale: "de", keyCount: 2, missing: 1, stale: 1, upToDate: 1 },
    ]);
  });

  it("reports every configured target locale by default, in config order", async () => {
    const dir = await project({ a: "A" }, { de: { a: "Aa" }, fr: { a: "Af" } });
    await writeJsonFile(join(dir, "verbatra.lock.json"), {
      version: 1,
      locales: { de: { a: contentHash(entry("A")) }, fr: { a: contentHash(entry("A")) } },
    });

    const result = await lockState({ config: cfg(), cwd: dir });

    expect(result.exists).toBe(true);
    if (!result.exists) {
      throw new Error("expected exists: true");
    }
    expect(result.locales.map((locale) => locale.locale)).toEqual(["de", "fr"]);
  });

  it("honors a valid locales subset and preserves config order", async () => {
    const dir = await project({ a: "A" }, { de: { a: "Aa" }, fr: { a: "Af" } });
    await writeJsonFile(join(dir, "verbatra.lock.json"), { version: 1, locales: {} });

    const result = await lockState({ config: cfg(), cwd: dir, locales: ["fr", "de"] });

    expect(result.exists).toBe(true);
    if (!result.exists) {
      throw new Error("expected exists: true");
    }
    expect(result.locales.map((locale) => locale.locale)).toEqual(["de", "fr"]);
  });

  it("rejects an unknown requested locale with UNKNOWN_LOCALE, even when no lock-file exists", async () => {
    const dir = await project({ a: "A" }, { de: { a: "Aa" } });
    await expect(
      lockState({ config: cfg({ targetLocales: ["de"] }), cwd: dir, locales: ["es"] }),
    ).rejects.toMatchObject({ code: "UNKNOWN_LOCALE" });
  });

  it("writes nothing and never mutates the lock (read-only)", async () => {
    const dir = await project({ a: "A" }, { de: { a: "Aa" } });
    const fs = makeFakeFs({
      ...realDiskReads(),
      fileExists: async (path: string) =>
        path.endsWith("verbatra.lock.json") || realDiskReads().fileExists(path),
      readFileBounded: async (path: string, maxBytes: number) =>
        path.endsWith("verbatra.lock.json")
          ? { kind: "ok" as const, content: '{"version":1,"locales":{}}' }
          : realDiskReads().readFileBounded(path, maxBytes),
      writeFile: async () => {
        throw new Error("lockState must not write a file");
      },
      writeBytes: async () => {
        throw new Error("lockState must not write bytes");
      },
    });
    const result = await lockState({ config: cfg({ targetLocales: ["de"] }), cwd: dir }, { fs });
    expect(result).toMatchObject({
      exists: true,
      version: 1,
      locales: [{ locale: "de", keyCount: 0, missing: 0, stale: 0, upToDate: 1 }],
    });
  });

  it("throws SOURCE_UNREADABLE when the lock-file exists but the source file is absent", async () => {
    const dir = await makeTempDir();
    await writeJsonFile(join(dir, "verbatra.lock.json"), { version: 1, locales: {} });
    await expect(
      lockState({ config: cfg({ targetLocales: ["de"] }), cwd: dir }),
    ).rejects.toMatchObject({ code: "SOURCE_UNREADABLE" });
  });

  it("throws UNKNOWN_FORMAT when the lock-file exists but no adapter is registered for the format", async () => {
    const dir = await project({ a: "A" }, { de: { a: "Aa" } });
    await writeJsonFile(join(dir, "verbatra.lock.json"), { version: 1, locales: {} });
    await expect(
      lockState({
        config: cfg({ format: "unknown-format" as VerbatraConfig["format"] }),
        cwd: dir,
      }),
    ).rejects.toMatchObject({ code: "UNKNOWN_FORMAT" });
  });

  it("throws LOCK_FILE_INVALID when the lock-file is corrupt", async () => {
    const dir = await project({ a: "A" }, { de: { a: "Aa" } });
    await writeJsonFile(join(dir, "verbatra.lock.json"), "not a lock object");
    await expect(
      lockState({ config: cfg({ targetLocales: ["de"] }), cwd: dir }),
    ).rejects.toMatchObject({ code: "LOCK_FILE_INVALID" });
  });
});
