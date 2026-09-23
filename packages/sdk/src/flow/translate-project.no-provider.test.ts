import { readFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PROVIDER_ENV } from "@verbatra/ai-providers";
import { contentHash } from "@verbatra/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { computeFingerprint } from "../cache/fingerprint.js";
import {
  applyAdditions,
  cacheFilePath,
  readTranslationMemory,
  writeTranslationMemory,
} from "../cache/translation-memory.js";
import type { VerbatraConfig } from "../config/schema.js";
import { defaultFs } from "../fs.js";
import { lockFilePath, readLockFile } from "../lock/lock-file.js";
import type { CreateProvider } from "../selection/select-provider.js";
import { baseConfig, makeTempDir, readJsonFile, writeJsonFile } from "../test-support.js";
import { translate } from "./translate-project.js";

const PROVIDER_ENV_VARS: readonly string[] = Object.values(PROVIDER_ENV);

const SOURCE_PATH = fileURLToPath(new URL("./translate-project.ts", import.meta.url));

const humanOnly = (overrides: Partial<VerbatraConfig> = {}): VerbatraConfig =>
  baseConfig({ targetLocales: ["de"], provider: { id: "none", options: {} }, ...overrides });

async function project(
  source: Record<string, string>,
  target?: Record<string, string>,
): Promise<string> {
  const dir = await makeTempDir();
  await mkdir(join(dir, "locales"));
  await writeJsonFile(join(dir, "locales", "en.json"), source);
  if (target !== undefined) {
    await writeJsonFile(join(dir, "locales", "de.json"), target);
  }
  return dir;
}

async function seedMemory(
  dir: string,
  config: VerbatraConfig,
  entries: Record<string, { readonly source: string; readonly value: string }>,
): Promise<void> {
  const additions = Object.fromEntries(
    Object.entries(entries).map(([key, entry]) => {
      const hash = contentHash({
        key,
        namespace: "en",
        value: entry.source,
        isPlural: false,
        placeholders: [],
      });
      return [hash, { contentHash: hash, value: entry.value, source: entry.source }];
    }),
  );
  const { memory } = await readTranslationMemory(cacheFilePath(dir), defaultFs);
  const merged = applyAdditions(memory, computeFingerprint(config), new Map([["de", additions]]));
  await writeTranslationMemory(cacheFilePath(dir), merged, defaultFs);
}

function refusingFactory(): { readonly create: CreateProvider; readonly calls: number[] } {
  const calls: number[] = [];
  return {
    calls,
    create: () => {
      calls.push(1);
      throw new Error("a human-only run must never construct a provider");
    },
  };
}

const originalFetch = globalThis.fetch;
const originalEnv = new Map(PROVIDER_ENV_VARS.map((name) => [name, process.env[name]]));

beforeEach(() => {
  for (const name of PROVIDER_ENV_VARS) {
    delete process.env[name];
  }
  globalThis.fetch = vi.fn((): never => {
    throw new Error("a human-only run must make no network request");
  });
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const [name, value] of originalEnv) {
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }
});

describe("static proof: translate has exactly one provider selection site", () => {
  const content = readFileSync(SOURCE_PATH, "utf8");

  it("reads the source it is asserting about, so the check cannot pass vacuously", () => {
    expect(content).toContain("export async function translate(");
  });

  it("selects a provider in one place only, the one the runtime tests below exercise", () => {
    expect(content.match(/selectProvider\(/g)).toHaveLength(1);
  });
});

describe("translate: human-only mode never reaches a provider", () => {
  it("never calls the provider factory, reads no key, and makes no network call", async () => {
    const dir = await project({ greeting: "Hello", farewell: "Bye" });
    const factory = refusingFactory();

    const summary = await translate(
      { config: humanOnly(), cwd: dir },
      { createProvider: factory.create },
    );

    expect(factory.calls).toEqual([]);
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(summary.failed).toEqual([]);
    expect(summary.locales[0]?.unfilled).toEqual(["farewell", "greeting"]);
  });

  it("completes with the default factory while every provider key is unset", async () => {
    const dir = await project({ greeting: "Hello" });

    const summary = await translate({ config: humanOnly(), cwd: dir });

    expect(summary.succeeded).toEqual(["de"]);
    expect(summary.locales[0]?.unfilled).toEqual(["greeting"]);
  });

  it("generates no plural form even when plural generation is requested", async () => {
    const dir = await project({ item_one: "{{count}} item", item_other: "{{count}} items" });

    const summary = await translate({
      config: humanOnly({ targetLocales: ["pl"], generatePlurals: true }),
      cwd: dir,
    });

    expect(summary.locales[0]?.generated).toEqual([]);
    expect(summary.locales[0]?.unfilled).toEqual(["item_one", "item_other"]);
  });
});

describe("translate: human-only mode fills from the translation memory alone", () => {
  it("writes memory hits, leaves every other key for a human, and locks only what landed", async () => {
    const config = humanOnly();
    const dir = await project({ greeting: "Hello", farewell: "Bye", thanks: "Thanks" });
    await seedMemory(dir, config, { greeting: { source: "Hello", value: "Hallo" } });

    const summary = await translate({ config, cwd: dir });

    const locale = summary.locales[0];
    expect(locale?.status).toBe("succeeded");
    expect(locale?.cacheHits).toEqual(["greeting"]);
    expect(locale?.translated).toEqual([]);
    expect(locale?.unfilled).toEqual(["farewell", "thanks"]);
    expect(await readJsonFile(join(dir, "locales", "de.json"))).toEqual({ greeting: "Hallo" });
    const lock = await readLockFile(lockFilePath(dir), defaultFs);
    expect(Object.keys(lock.locales.de ?? {})).toEqual(["greeting"]);
  });

  it("keeps a stale key's old value and baseline, so it is offered again on the next run", async () => {
    const config = humanOnly();
    const dir = await project({ greeting: "Hello" });
    await seedMemory(dir, config, { greeting: { source: "Hello", value: "Hallo" } });
    await translate({ config, cwd: dir });

    await writeJsonFile(join(dir, "locales", "en.json"), { greeting: "Hello there" });
    const first = await translate({ config, cwd: dir });
    const second = await translate({ config, cwd: dir });

    expect(first.locales[0]?.unfilled).toEqual(["greeting"]);
    expect(second.locales[0]?.unfilled).toEqual(["greeting"]);
    expect(await readJsonFile(join(dir, "locales", "de.json"))).toEqual({ greeting: "Hallo" });
  });

  it("reports every key sharing an uncovered source string, not only one representative", async () => {
    const dir = await project({ a: "Same", b: "Same" });

    const summary = await translate({ config: humanOnly(), cwd: dir });

    expect(summary.locales[0]?.unfilled).toEqual(["a", "b"]);
    expect(summary.locales[0]?.providerFailures).toEqual([]);
  });

  it("never writes a fuzzy reuse, so the key stays missing and unfilled on every run", async () => {
    const config = humanOnly({ fuzzyCache: { enabled: true, threshold: 0.8 } });
    const dir = await project({ greeting: "Hello there, friend!" });
    await seedMemory(dir, config, {
      greeting: { source: "Hello there, friend", value: "Hallo, Freund" },
    });

    const first = await translate({ config, cwd: dir });
    const second = await translate({ config, cwd: dir });

    for (const run of [first, second]) {
      expect(run.locales[0]?.unfilled).toEqual(["greeting"]);
      expect(run.locales[0]?.fuzzyHits).toEqual([]);
      expect(run.locales[0]?.cacheHits).toEqual([]);
    }
    expect(await readJsonFile(join(dir, "locales", "de.json"))).toEqual({});
  });

  it("keeps using memory entries after the tone or glossary change", async () => {
    const dir = await project({ greeting: "Hello" });
    await seedMemory(dir, humanOnly(), { greeting: { source: "Hello", value: "Hallo" } });

    const summary = await translate({
      config: humanOnly({ tone: "formal", glossary: { Hello: "Hallo" } }),
      cwd: dir,
    });

    expect(summary.locales[0]?.cacheHits).toEqual(["greeting"]);
    expect(summary.locales[0]?.unfilled).toEqual([]);
  });

  it("creates an empty target file when nothing landed and none existed yet", async () => {
    const dir = await project({ greeting: "Hello" });

    await translate({ config: humanOnly(), cwd: dir });

    expect(await readJsonFile(join(dir, "locales", "de.json"))).toEqual({});
  });
});

describe("translate: a human-only dry run", () => {
  it("lists every pending key as unfilled, translates nothing, and writes nothing", async () => {
    const dir = await project({ greeting: "Hello", farewell: "Bye" }, { greeting: "Hallo" });
    const factory = refusingFactory();

    const summary = await translate(
      { config: humanOnly(), cwd: dir, dryRun: true },
      { createProvider: factory.create },
    );

    expect(factory.calls).toEqual([]);
    expect(summary.dryRun).toBe(true);
    expect(summary.locales[0]?.translated).toEqual([]);
    expect(summary.locales[0]?.unfilled).toEqual(["farewell"]);
    expect(await readJsonFile(join(dir, "locales", "de.json"))).toEqual({ greeting: "Hallo" });
  });

  it("reads the translation memory, so its plan matches what a live run would do", async () => {
    const config = humanOnly();
    const dir = await project({ greeting: "Hello", farewell: "Bye" });
    await seedMemory(dir, config, { greeting: { source: "Hello", value: "Hallo" } });

    const plan = await translate({ config, cwd: dir, dryRun: true });

    expect(plan.locales[0]?.cacheHits).toEqual(["greeting"]);
    expect(plan.locales[0]?.unfilled).toEqual(["farewell"]);
    await expect(readJsonFile(join(dir, "locales", "de.json"))).rejects.toThrow();

    const live = await translate({ config, cwd: dir });
    expect(live.locales[0]?.cacheHits).toEqual(plan.locales[0]?.cacheHits);
    expect(live.locales[0]?.unfilled).toEqual(plan.locales[0]?.unfilled);
  });

  it("estimates nothing to send and nothing billed", async () => {
    const dir = await project({ greeting: "Hello" });

    const summary = await translate({ config: humanOnly(), cwd: dir, estimate: true });

    expect(summary.estimate).toMatchObject({
      provider: "none",
      rateKey: "none",
      keys: 0,
      requests: 0,
      pricing: "not-billed",
    });
  });
});
