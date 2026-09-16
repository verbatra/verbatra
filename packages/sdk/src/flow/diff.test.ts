import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { contentHash, type TranslationEntry } from "@verbatra/core";
import { describe, expect, it } from "vitest";
import type { ExtractionConfig } from "../config/extraction-config.js";
import type { VerbatraConfig } from "../config/schema.js";
import { defaultFs } from "../fs.js";
import {
  baseConfig,
  makeFakeFs,
  makeTempDir,
  realDiskReads,
  writeJsonFile,
} from "../test-support.js";
import { diff } from "./diff.js";

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

describe("diff", () => {
  it("reports no pending changes when every locale carries the source keys", async () => {
    const dir = await project(
      { a: "A", b: "B" },
      { de: { a: "Aa", b: "Ba" }, fr: { a: "Af", b: "Bf" } },
    );
    const summary = await diff({ config: cfg(), cwd: dir });

    expect(summary.hasPendingChanges).toBe(false);
    expect(summary.locales.map((l) => l.locale)).toEqual(["de", "fr"]);
    expect(summary.locales[0]).toEqual({
      locale: "de",
      missing: [],
      changed: [],
      orphaned: [],
      hasPendingChanges: false,
    });
  });

  it("lists missing keys and marks the locale pending (missing only)", async () => {
    const dir = await project({ a: "A", b: "B" }, { de: { a: "Aa" } });
    const summary = await diff({ config: cfg(), cwd: dir });

    expect(summary.hasPendingChanges).toBe(true);
    expect(summary.locales[0]).toEqual({
      locale: "de",
      missing: ["b"],
      changed: [],
      orphaned: [],
      hasPendingChanges: true,
    });
    expect(summary.locales[1]).toEqual({
      locale: "fr",
      missing: ["a", "b"],
      changed: [],
      orphaned: [],
      hasPendingChanges: true,
    });
  });

  it("lists changed keys whose source drifted from the recorded baseline (changed only)", async () => {
    const dir = await project({ a: "A new", b: "B" }, { de: { a: "Aa", b: "Ba" } });
    await writeJsonFile(join(dir, "verbatra.lock.json"), {
      version: 1,
      locales: { de: { a: contentHash(entry("A old")), b: contentHash(entry("B")) } },
    });

    const summary = await diff({ config: cfg({ targetLocales: ["de"] }), cwd: dir });

    expect(summary.hasPendingChanges).toBe(true);
    expect(summary.locales[0]).toEqual({
      locale: "de",
      missing: [],
      changed: ["a"],
      orphaned: [],
      hasPendingChanges: true,
    });
  });

  it("lists orphaned keys but they alone do NOT set hasPendingChanges", async () => {
    const dir = await project({ a: "A" }, { de: { a: "Aa", legacy: "old" } });
    const summary = await diff({ config: cfg({ targetLocales: ["de"] }), cwd: dir });

    expect(summary.hasPendingChanges).toBe(false);
    expect(summary.locales[0]).toEqual({
      locale: "de",
      missing: [],
      changed: [],
      orphaned: ["legacy"],
      hasPendingChanges: false,
    });
  });

  it("reports a mixed locale with missing, changed, and orphaned lists together", async () => {
    const dir = await project(
      { a: "A new", b: "B", c: "C" },
      { de: { a: "Aa", b: "Ba", legacy: "old" } },
    );
    await writeJsonFile(join(dir, "verbatra.lock.json"), {
      version: 1,
      locales: { de: { a: contentHash(entry("A old")), b: contentHash(entry("B")) } },
    });

    const summary = await diff({ config: cfg({ targetLocales: ["de"] }), cwd: dir });

    expect(summary.locales[0]).toEqual({
      locale: "de",
      missing: ["c"],
      changed: ["a"],
      orphaned: ["legacy"],
      hasPendingChanges: true,
    });
    expect(summary.hasPendingChanges).toBe(true);
  });

  it("honors a valid locales subset and preserves config order", async () => {
    const dir = await project({ a: "A" }, { de: { a: "Aa" }, fr: { a: "Af" } });
    const summary = await diff({ config: cfg(), cwd: dir, locales: ["fr", "de"] });

    expect(summary.locales.map((l) => l.locale)).toEqual(["de", "fr"]);
    expect(summary.hasPendingChanges).toBe(false);
  });

  it("rejects an unknown requested locale with UNKNOWN_LOCALE instead of silently dropping it", async () => {
    const dir = await project({ a: "A" }, { de: { a: "Aa" }, fr: { a: "Af" } });
    await expect(diff({ config: cfg(), cwd: dir, locales: ["fr", "es"] })).rejects.toMatchObject({
      code: "UNKNOWN_LOCALE",
    });
  });

  it("writes nothing and never touches the lock (read-only)", async () => {
    const dir = await project({ a: "A", b: "B" }, { de: { a: "Aa" } });
    const fs = makeFakeFs({
      ...realDiskReads(),
      writeFile: async () => {
        throw new Error("diff must not write a file");
      },
      writeBytes: async () => {
        throw new Error("diff must not write bytes");
      },
    });
    const summary = await diff({ config: cfg({ targetLocales: ["de"] }), cwd: dir }, { fs });
    expect(summary.locales[0]?.locale).toBe("de");
  });

  it("defaults the working directory to process.cwd() when cwd is omitted", async () => {
    const dir = await project({ a: "A" }, { de: { a: "Aa" } });
    const previous = process.cwd();
    try {
      process.chdir(dir);
      const summary = await diff({ config: cfg({ targetLocales: ["de"] }) });
      expect(summary.hasPendingChanges).toBe(false);
      expect(summary.locales[0]?.locale).toBe("de");
    } finally {
      process.chdir(previous);
    }
  });

  it("throws SOURCE_UNREADABLE when the source file is absent", async () => {
    const dir = await makeTempDir();
    await expect(diff({ config: cfg({ targetLocales: ["de"] }), cwd: dir })).rejects.toMatchObject({
      code: "SOURCE_UNREADABLE",
    });
  });

  it("throws UNKNOWN_FORMAT when no adapter is registered for the format", async () => {
    const dir = await project({ a: "A" }, { de: { a: "Aa" } });
    await expect(
      diff({ config: cfg({ format: "unknown-format" as VerbatraConfig["format"] }), cwd: dir }),
    ).rejects.toMatchObject({ code: "UNKNOWN_FORMAT" });
  });

  it("throws LOCK_FILE_INVALID when the lock file is corrupt", async () => {
    const dir = await project({ a: "A" }, { de: { a: "Aa" } });
    await writeJsonFile(join(dir, "verbatra.lock.json"), "not a lock object");
    await expect(diff({ config: cfg({ targetLocales: ["de"] }), cwd: dir })).rejects.toMatchObject({
      code: "LOCK_FILE_INVALID",
    });
  });
});

describe("diff with the unused-key report", () => {
  const extract: ExtractionConfig = { framework: "i18next", roots: ["src"] };

  async function withSource(dir: string, files: Readonly<Record<string, string>>): Promise<void> {
    for (const [relativePath, content] of Object.entries(files)) {
      await mkdir(join(dir, relativePath, ".."), { recursive: true });
      await writeFile(join(dir, relativePath), content, "utf8");
    }
  }

  it("leaves the report out, and scans nothing, unless it is asked for", async () => {
    const dir = await project({ a: "A" }, { de: { a: "Aa" } });
    const fs = makeFakeFs({
      ...realDiskReads(),
      readDirectory: async () => {
        throw new Error("the source must not be scanned");
      },
    });

    const summary = await diff(
      { config: cfg({ targetLocales: ["de"], extract }), cwd: dir },
      { fs },
    );

    expect("unused" in summary).toBe(false);
  });

  it("keeps unused source keys and orphaned target keys as two separate lists", async () => {
    const dir = await project(
      { used: "Used", unusedKey: "Unused" },
      { de: { used: "Benutzt", unusedKey: "Unbenutzt", gone: "Weg" } },
    );
    await withSource(dir, { "src/app.ts": 't("used");' });

    const summary = await diff({
      config: cfg({ targetLocales: ["de"], extract }),
      cwd: dir,
      unused: true,
    });

    expect(summary.locales[0]?.orphaned).toEqual(["gone"]);
    expect(summary.unused).toMatchObject({
      status: "complete",
      unused: [{ key: "unusedKey", catalogKey: "unusedKey" }],
    });
    expect(summary.hasPendingChanges).toBe(false);
  });

  it("reports not-run inside a successful diff when no extract block is configured", async () => {
    const dir = await project({ a: "A" }, { de: { a: "Aa" } });

    const summary = await diff({ config: cfg({ targetLocales: ["de"] }), cwd: dir, unused: true });

    expect(summary.unused).toMatchObject({ status: "not-run", reason: "EXTRACT_NOT_CONFIGURED" });
    expect(summary.locales).toHaveLength(1);
  });

  it("scans relative to process.cwd() when cwd is omitted", async () => {
    const dir = await project({ a: "A", b: "B" }, { de: { a: "Aa", b: "Ba" } });
    await withSource(dir, { "src/app.ts": 't("a");' });
    const previous = process.cwd();
    try {
      process.chdir(dir);
      const summary = await diff({ config: cfg({ targetLocales: ["de"], extract }), unused: true });
      expect(summary.unused).toMatchObject({
        status: "complete",
        unused: [{ key: "b", catalogKey: "b" }],
      });
    } finally {
      process.chdir(previous);
    }
  });

  it("passes the extractor factory through to the scan", async () => {
    const dir = await project({ a: "A", b: "B" }, { de: { a: "Aa", b: "Ba" } });
    await withSource(dir, { "src/app.ts": "anything" });

    const summary = await diff(
      { config: cfg({ targetLocales: ["de"], extract }), cwd: dir, unused: true },
      {
        createExtractor: (framework) => ({
          framework,
          extensions: [".ts"],
          extract: () => ({ calls: [{ key: "b", line: 1 }], dynamic: [] }),
        }),
      },
    );

    expect(summary.unused).toMatchObject({
      status: "complete",
      unused: [{ key: "a", catalogKey: "a" }],
    });
  });

  it("reads the source catalog once for both the locale diff and the unused-key report", async () => {
    const dir = await project({ a: "A", b: "B" }, { de: { a: "Aa", b: "Ba" } });
    await withSource(dir, { "src/app.ts": 't("a");' });
    const sourceReads: string[] = [];
    const fs = {
      ...defaultFs,
      readFileBounded: (path: string, maxBytes: number) => {
        if (path.endsWith(join("locales", "en.json"))) {
          sourceReads.push(path);
        }
        return defaultFs.readFileBounded(path, maxBytes);
      },
    };

    const summary = await diff(
      { config: cfg({ targetLocales: ["de"], extract }), cwd: dir, unused: true },
      { fs },
    );

    expect(summary.unused).toMatchObject({ unused: [{ key: "b" }] });
    expect(sourceReads).toHaveLength(1);
  });
});
