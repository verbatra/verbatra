import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { BoundedFileRead } from "../fs.js";
import { makeFakeFs, makeTempDir, readTextFile } from "../test-support.js";
import {
  additionsToRecord,
  applyAdditions,
  CACHE_FILE_NAME,
  CURRENT_CACHE_VERSION,
  cacheFilePath,
  feedTranslationMemory,
  lookupMemory,
  lookupSource,
  readTranslationMemory,
  writeTranslationMemory,
} from "./translation-memory.js";
import type { CacheAddition, TranslationMemory } from "./types.js";

function added(
  contentHash: string,
  value: string,
  source: string,
): Readonly<Record<string, CacheAddition>> {
  return { [contentHash]: { contentHash, value, source } };
}

const okRead = (content: string): BoundedFileRead => ({ kind: "ok", content });

function memory(
  entries: TranslationMemory["entries"],
  sources: TranslationMemory["sources"] = {},
): TranslationMemory {
  return { version: CURRENT_CACHE_VERSION, entries, sources };
}

const SAMPLE = memory({ fp1: { de: { h1: "Hallo", h2: "Tschuss" } } });

describe("cacheFilePath", () => {
  it("resolves the cache file as a sibling of the lock file", () => {
    expect(cacheFilePath("/project")).toBe(join("/project", CACHE_FILE_NAME));
    expect(CACHE_FILE_NAME).toBe("verbatra.cache.json");
  });
});

const EMPTY = { version: CURRENT_CACHE_VERSION, entries: {}, sources: {} };

describe("readTranslationMemory: degrade-to-empty", () => {
  it("returns an empty memory for a missing file", async () => {
    expect(await readTranslationMemory("/x", makeFakeFs())).toEqual({
      memory: EMPTY,
      writable: true,
    });
  });

  it("returns an empty memory for an over-cap file", async () => {
    const fs = makeFakeFs({ readFileBounded: async () => ({ kind: "too-large" }) });
    expect(await readTranslationMemory("/x", fs)).toEqual({ memory: EMPTY, writable: true });
  });

  it("returns an empty memory when the read throws a post-open I/O fault", async () => {
    const fs = makeFakeFs({
      readFileBounded: async () => {
        throw new Error("EIO: i/o error after open");
      },
    });
    expect(await readTranslationMemory("/x", fs)).toEqual({ memory: EMPTY, writable: true });
  });

  it("returns an empty memory for unparseable JSON", async () => {
    const fs = makeFakeFs({ readFileBounded: async () => okRead("{not json") });
    expect(await readTranslationMemory("/x", fs)).toEqual({ memory: EMPTY, writable: true });
  });

  it("returns an empty memory for a structurally invalid file", async () => {
    const fs = makeFakeFs({ readFileBounded: async () => okRead('{"version":1,"entries":[]}') });
    expect(await readTranslationMemory("/x", fs)).toEqual({ memory: EMPTY, writable: true });
  });

  it("parses a well-formed file", async () => {
    const fs = makeFakeFs({ readFileBounded: async () => okRead(JSON.stringify(SAMPLE)) });
    expect(await readTranslationMemory("/x", fs)).toEqual({ memory: SAMPLE, writable: true });
  });
});

describe("readTranslationMemory: writability", () => {
  it("marks a file from a future version non-writable", async () => {
    const future = JSON.stringify({ version: CURRENT_CACHE_VERSION + 1, entries: {} });
    const fs = makeFakeFs({ readFileBounded: async () => okRead(future) });
    expect(await readTranslationMemory("/x", fs)).toEqual({ memory: EMPTY, writable: false });
  });

  it.each([
    ["zero", '{"version":0,"entries":{}}'],
    ["negative", '{"version":-1,"entries":{}}'],
    ["non-integer", '{"version":1.5,"entries":{}}'],
  ])("treats a %s version as corrupt, so the file stays writable", async (_label, content) => {
    const fs = makeFakeFs({ readFileBounded: async () => okRead(content) });
    expect(await readTranslationMemory("/x", fs)).toEqual({ memory: EMPTY, writable: true });
  });
});

const V1_SCHEMA = z.object({
  version: z.number().int().positive(),
  entries: z.record(z.string(), z.record(z.string(), z.record(z.string(), z.string()))),
});

describe("a cache this build writes stays legible to the build that shipped version 1", () => {
  it("is the version bump, not a parse failure, that an older build sees", async () => {
    const dir = await makeTempDir();
    const path = cacheFilePath(dir);
    const current = memory({ fp1: { de: { h1: "Hallo" } } }, { h1: "Hello" });

    await writeTranslationMemory(path, current, makeFakeFsWriting(dir));
    const onDisk: unknown = JSON.parse(await readTextFile(path));
    const asV1 = V1_SCHEMA.safeParse(onDisk);

    expect(asV1.success).toBe(true);
    expect(asV1.success && asV1.data.version).not.toBe(1);
    expect(asV1.success && asV1.data.entries).toEqual({ fp1: { de: { h1: "Hallo" } } });
  });

  it("would have the older build overwrite the file if the entry shape had changed", () => {
    const reshaped = {
      version: CURRENT_CACHE_VERSION,
      entries: { fp1: { de: { h1: { value: "Hallo", source: "Hello" } } } },
    };

    expect(V1_SCHEMA.safeParse(reshaped).success).toBe(false);
  });
});

describe("readTranslationMemory: version 1 files", () => {
  it("carries a version 1 file forward with no source text rather than rejecting it", async () => {
    const legacy = JSON.stringify({ version: 1, entries: { fp1: { de: { h1: "Hallo" } } } });
    const fs = makeFakeFs({ readFileBounded: async () => okRead(legacy) });

    expect(await readTranslationMemory("/x", fs)).toEqual({
      memory: memory({ fp1: { de: { h1: "Hallo" } } }),
      writable: true,
    });
  });

  it("rejects a sources block that is not a string map", async () => {
    const broken = JSON.stringify({ version: CURRENT_CACHE_VERSION, entries: {}, sources: [] });
    const fs = makeFakeFs({ readFileBounded: async () => okRead(broken) });

    expect(await readTranslationMemory("/x", fs)).toEqual({ memory: EMPTY, writable: true });
  });
});

describe("lookupSource", () => {
  it("returns the source text filed under a content hash", () => {
    expect(lookupSource(memory({}, { h1: "Hello" }), "h1")).toBe("Hello");
  });

  it("returns undefined for a hash with no source text on file", () => {
    expect(lookupSource(memory({}, { h1: "Hello" }), "h2")).toBeUndefined();
  });
});

describe("lookupMemory", () => {
  it("returns the cached value on a full match", () => {
    expect(lookupMemory(SAMPLE, "fp1", "de", "h1")).toBe("Hallo");
  });

  it("returns undefined for a missing fingerprint, locale, or hash", () => {
    expect(lookupMemory(SAMPLE, "other", "de", "h1")).toBeUndefined();
    expect(lookupMemory(SAMPLE, "fp1", "fr", "h1")).toBeUndefined();
    expect(lookupMemory(SAMPLE, "fp1", "de", "hZ")).toBeUndefined();
  });
});

describe("applyAdditions", () => {
  it("returns the base unchanged when there is nothing to add", () => {
    expect(applyAdditions(SAMPLE, "fp1", new Map())).toBe(SAMPLE);
  });

  it("adds a new locale and preserves existing locales under the same fingerprint", () => {
    const merged = applyAdditions(SAMPLE, "fp1", new Map([["fr", added("h9", "Bonjour", "Hi")]]));
    expect(merged.entries.fp1?.de).toEqual({ h1: "Hallo", h2: "Tschuss" });
    expect(merged.entries.fp1?.fr).toEqual({ h9: "Bonjour" });
  });

  it("merges into an existing locale and overwrites a repeated hash", () => {
    const merged = applyAdditions(
      SAMPLE,
      "fp1",
      new Map([["de", { ...added("h1", "Hi", "Hello"), ...added("h3", "Neu", "New") }]]),
    );
    expect(merged.entries.fp1?.de).toEqual({ h1: "Hi", h2: "Tschuss", h3: "Neu" });
  });

  it("preserves other fingerprints untouched", () => {
    const base = memory({ fp1: { de: { h1: "A" } }, fp2: { de: { h1: "B" } } });
    const merged = applyAdditions(base, "fp1", new Map([["de", added("h1", "C", "See")]]));
    expect(merged.entries.fp2?.de).toEqual({ h1: "B" });
    expect(merged.entries.fp1?.de).toEqual({ h1: "C" });
  });

  it("files the source text of every addition under its content hash", () => {
    const merged = applyAdditions(
      SAMPLE,
      "fp1",
      new Map([
        ["fr", added("h9", "Bonjour", "Hello there")],
        ["es", added("h9", "Hola", "Hello there")],
      ]),
    );
    expect(merged.sources).toEqual({ h9: "Hello there" });
  });

  it("keeps source text already on file for hashes this run did not touch", () => {
    const base = memory({ fp1: { de: { h1: "Hallo" } } }, { h1: "Hello" });
    const merged = applyAdditions(base, "fp1", new Map([["de", added("h2", "Neu", "New")]]));
    expect(merged.sources).toEqual({ h1: "Hello", h2: "New" });
  });

  it("backfills source text for a hash whose translation is already on file", () => {
    const base = memory({ fp1: { de: { h1: "Hallo" } } });
    const merged = applyAdditions(base, "fp1", new Map([["de", added("h1", "Hallo", "Hello")]]));
    expect(merged.sources).toEqual({ h1: "Hello" });
    expect(merged.entries.fp1?.de).toEqual({ h1: "Hallo" });
  });
});

describe("additionsToRecord", () => {
  it("keys each addition by its content hash", () => {
    expect(
      additionsToRecord([
        { contentHash: "h1", value: "one", source: "eins" },
        { contentHash: "h2", value: "two", source: "zwei" },
      ]),
    ).toEqual({
      h1: { contentHash: "h1", value: "one", source: "eins" },
      h2: { contentHash: "h2", value: "two", source: "zwei" },
    });
  });
});

describe("writeTranslationMemory", () => {
  it("serializes deterministically with every level's keys sorted", async () => {
    const dir = await makeTempDir();
    const path = cacheFilePath(dir);
    const unsorted = memory({
      fpB: { fr: { z: "1", a: "2" } },
      fpA: { de: { m: "3" } },
    });
    await writeTranslationMemory(path, unsorted, makeFakeFsWriting(dir));
    const written = await readTextFile(path);
    const fpKeys = Object.keys((JSON.parse(written) as TranslationMemory).entries);
    expect(fpKeys).toEqual(["fpA", "fpB"]);
    expect(Object.keys((JSON.parse(written) as TranslationMemory).entries.fpB?.fr ?? {})).toEqual([
      "a",
      "z",
    ]);
    expect(written.endsWith("\n")).toBe(true);
  });

  it("sorts the source-text block and stamps the current version", async () => {
    const dir = await makeTempDir();
    const path = cacheFilePath(dir);
    const unsorted: TranslationMemory = {
      version: 1,
      entries: { fpA: { de: { m: "3" } } },
      sources: { z: "last", a: "first" },
    };

    await writeTranslationMemory(path, unsorted, makeFakeFsWriting(dir));
    const parsed = JSON.parse(await readTextFile(path)) as TranslationMemory;

    expect(Object.keys(parsed.sources)).toEqual(["a", "z"]);
    expect(parsed.version).toBe(CURRENT_CACHE_VERSION);
  });
});

describe("feedTranslationMemory", () => {
  it("is a no-op when there are no additions", async () => {
    const writeFile = vi.fn(async () => {});
    await feedTranslationMemory("/x", makeFakeFs({ writeFile }), "fp1", new Map());
    expect(writeFile).not.toHaveBeenCalled();
  });

  it("overlays additions onto the current file and writes once", async () => {
    let stored = JSON.stringify(SAMPLE);
    const fs = makeFakeFs({
      readFileBounded: async () => okRead(stored),
      writeFile: async (_p, data) => {
        stored = data;
      },
    });
    await feedTranslationMemory("/x", fs, "fp1", new Map([["de", added("h3", "Neu", "New")]]));
    const parsed = JSON.parse(stored) as TranslationMemory;
    expect(parsed.entries.fp1?.de).toEqual({ h1: "Hallo", h2: "Tschuss", h3: "Neu" });
    expect(parsed.sources).toEqual({ h3: "New" });
  });

  it("swallows a write failure so a cache problem never propagates", async () => {
    const fs = makeFakeFs({
      writeFile: async () => {
        throw new Error("disk full");
      },
    });
    await expect(
      feedTranslationMemory("/x", fs, "fp1", new Map([["de", added("h3", "Neu", "New")]])),
    ).resolves.toBeUndefined();
  });
});

function makeFakeFsWriting(_dir: string): ReturnType<typeof makeFakeFs> {
  return makeFakeFs({
    writeFile: async (path, data) => {
      const { writeFile } = await import("node:fs/promises");
      await writeFile(path, data, "utf8");
    },
  });
}
