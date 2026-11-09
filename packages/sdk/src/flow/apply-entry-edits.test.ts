import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { contentHash, type TranslationEntry } from "@verbatra/core";
import { describe, expect, it } from "vitest";
import type { VerbatraConfig } from "../config/schema.js";
import { defaultFs, type SdkFs } from "../fs.js";
import { selectAdapter } from "../selection/select-adapter.js";
import { baseConfig, makeTempDir, readJsonFile, writeJsonFile } from "../test-support.js";
import { applyEntryEdits, type EntryEdit } from "./apply-entry-edits.js";

const config: VerbatraConfig = baseConfig({ targetLocales: ["de"], format: "i18next-json" });

async function project(
  source: Record<string, string>,
  target: Record<string, string>,
): Promise<string> {
  const dir = await makeTempDir();
  await mkdir(join(dir, "locales"));
  await writeJsonFile(join(dir, "locales", "en.json"), source);
  await writeJsonFile(join(dir, "locales", "de.json"), target);
  return dir;
}

function entry(key: string, value: string, placeholders: string[] = []): TranslationEntry {
  return { key, namespace: "en", value, placeholders, isPlural: false };
}

function edit(
  key: string,
  source: string,
  value: string,
  overrides: Partial<EntryEdit> = {},
): EntryEdit {
  return {
    key,
    sourceEntry: entry(key, source),
    value,
    origin: "human",
    stale: false,
    ...overrides,
  };
}

function countingFs(): { readonly fs: SdkFs; readonly writes: string[] } {
  const writes: string[] = [];
  return {
    writes,
    fs: {
      ...defaultFs,
      writeFile: async (path, data) => {
        writes.push(path.slice(path.lastIndexOf("/") + 1));
        await defaultFs.writeFile(path, data);
      },
    },
  };
}

const adapterFor = (fs: SdkFs = defaultFs) => selectAdapter("i18next-json", undefined, fs);

describe("applyEntryEdits", () => {
  it("writes the locale file, lock, provenance and memory once for many accepted edits", async () => {
    const keys = Array.from({ length: 25 }, (_, index) => `k${index}`);
    const dir = await project(
      Object.fromEntries(keys.map((key) => [key, `Source ${key}`])),
      Object.fromEntries(keys.map((key) => [key, "alt"])),
    );
    const { fs, writes } = countingFs();

    const outcomes = await applyEntryEdits(
      { cwd: dir, config, adapter: adapterFor(fs), fs, locale: "de" },
      keys.map((key) => edit(key, `Source ${key}`, `Neu ${key}`)),
    );

    expect(outcomes.every((outcome) => outcome.accepted)).toBe(true);
    expect(writes.filter((name) => name === "de.json")).toHaveLength(1);
    expect(writes.filter((name) => name === "verbatra.lock.json")).toHaveLength(1);
    expect(writes.filter((name) => name === "verbatra.provenance.json")).toHaveLength(1);
    expect(writes.filter((name) => name === "verbatra.cache.json")).toHaveLength(1);
    const de = (await readJsonFile(join(dir, "locales", "de.json"))) as Record<string, string>;
    expect(de.k24).toBe("Neu k24");
  });

  it("returns an outcome per edit in order and writes only the accepted ones", async () => {
    const dir = await project({ a: "Hello {{name}}", b: "Bye" }, { a: "alt", b: "alt" });
    const fs = defaultFs;

    const outcomes = await applyEntryEdits(
      { cwd: dir, config, adapter: adapterFor(fs), fs, locale: "de" },
      [
        {
          ...edit("a", "Hello {{name}}", "Hallo"),
          sourceEntry: entry("a", "Hello {{name}}", ["name"]),
        },
        edit("b", "Bye", "Tschuess"),
      ],
    );

    expect(outcomes[0]).toMatchObject({ accepted: false, reason: "placeholder", value: "Hallo" });
    expect(outcomes[1]).toEqual({ accepted: true, value: "Tschuess" });
    const de = (await readJsonFile(join(dir, "locales", "de.json"))) as Record<string, string>;
    expect(de).toEqual({ a: "alt", b: "Tschuess" });
  });

  it("writes nothing when every edit is refused", async () => {
    const dir = await project({ a: "Hello" }, { a: "alt" });
    const { fs, writes } = countingFs();

    const outcomes = await applyEntryEdits(
      { cwd: dir, config, adapter: adapterFor(fs), fs, locale: "de" },
      [edit("a", "Hello", "   ")],
    );

    expect(outcomes[0]).toMatchObject({ accepted: false, reason: "empty" });
    expect(writes).toEqual([]);
  });

  it("keeps the old lock hash and skips memory for a stale edit, and records a fresh provenance", async () => {
    const dir = await project({ a: "Hello new" }, { a: "alt" });
    await writeJsonFile(join(dir, "verbatra.lock.json"), {
      version: 1,
      locales: { de: { a: "hash-of-the-old-source" } },
    });

    await applyEntryEdits(
      { cwd: dir, config, adapter: adapterFor(), fs: defaultFs, locale: "de" },
      [edit("a", "Hello new", "Neu", { stale: true })],
    );

    const lock = (await readJsonFile(join(dir, "verbatra.lock.json"))) as {
      locales: Record<string, Record<string, string>>;
    };
    expect(lock.locales.de?.a).toBe("hash-of-the-old-source");
    expect(lock.locales.de?.a).not.toBe(contentHash(entry("a", "Hello new")));
    const memory = await defaultFs.fileExists(join(dir, "verbatra.cache.json"));
    expect(memory).toBe(false);
  });

  it("uses a target resource the caller already read instead of reading it again", async () => {
    const dir = await project({ a: "Hello" }, { a: "alt" });
    const reads: string[] = [];
    const fs: SdkFs = {
      ...defaultFs,
      readFileBounded: async (path, max) => {
        reads.push(path);
        return defaultFs.readFileBounded(path, max);
      },
    };
    const target = {
      locale: "de",
      namespace: "de",
      format: config.format,
      entries: new Map([["a", { ...entry("a", "Hello"), value: "alt" }]]),
    };

    await applyEntryEdits({ cwd: dir, config, adapter: adapterFor(fs), fs, locale: "de", target }, [
      edit("a", "Hello", "Hallo"),
    ]);

    const targetReads = reads.filter((path) => path.endsWith("de.json"));
    expect(targetReads).toHaveLength(1);
  });

  it("replaces a prior provenance record when asked for a fresh one, even for an equal value hash", async () => {
    const dir = await project({ a: "Hello" }, { a: "Hallo" });
    await applyEntryEdits(
      { cwd: dir, config, adapter: adapterFor(), fs: defaultFs, locale: "de" },
      [edit("a", "Hello", "Hallo", { origin: "agent" })],
    );
    await applyEntryEdits(
      { cwd: dir, config, adapter: adapterFor(), fs: defaultFs, locale: "de" },
      [edit("a", "Hello", "Hallo", { origin: "human" })],
      { freshProvenance: true },
    );

    const provenance = (await readJsonFile(join(dir, "verbatra.provenance.json"))) as {
      locales: Record<string, Record<string, { origin: string }>>;
    };
    expect(provenance.locales.de?.a?.origin).toBe("human");
  });
});
