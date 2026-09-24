import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { cacheFilePath } from "../cache/translation-memory.js";
import type { VerbatraConfig } from "../config/schema.js";
import { loadProvenance } from "../lock/load-provenance.js";
import { PROVENANCE_FILE_NAME, valueHash } from "../lock/provenance-file.js";
import type { CreateProvider } from "../selection/select-provider.js";
import {
  baseConfig,
  makeStubProvider,
  makeTempDir,
  readJsonFile,
  writeJsonFile,
} from "../test-support.js";
import { editEntry } from "./edit-entry.js";
import { rejectEntry } from "./review-decision.js";
import { translate } from "./translate-project.js";

const cfg = (overrides: Partial<VerbatraConfig> = {}): VerbatraConfig =>
  baseConfig({ targetLocales: ["de"], ...overrides });

const humanOnly = cfg({ provider: { id: "none", options: {} } });

const fresh = (prefix: string) => makeStubProvider({ translate: (value) => `${prefix} ${value}` });

async function project(source: Record<string, string>): Promise<string> {
  const dir = await makeTempDir();
  await mkdir(join(dir, "locales"));
  await writeJsonFile(join(dir, "locales", "en.json"), source);
  return dir;
}

async function targetValues(dir: string): Promise<Record<string, string>> {
  return (await readJsonFile(join(dir, "locales", "de.json"))) as Record<string, string>;
}

async function translatedThenRejectedWithTeammateMemory(
  source: Record<string, string>,
): Promise<{ dir: string; rejected: string }> {
  const dir = await project(source);
  const first = fresh("[old]");
  await translate({ config: cfg(), cwd: dir }, { createProvider: () => first.provider });
  const rejected = (await targetValues(dir)).greeting ?? "";
  const teammateMemory = await readFile(cacheFilePath(dir), "utf8");
  await rejectEntry({
    config: cfg(),
    cwd: dir,
    locale: "de",
    key: "greeting",
    expectedValue: rejected,
  });
  await writeFile(cacheFilePath(dir), teammateMemory, "utf8");
  return { dir, rejected };
}

async function editedThenRejectedWithTeammateMemory(
  config: VerbatraConfig,
  source: Record<string, string>,
): Promise<string> {
  const dir = await project(source);
  await editEntry({ config, cwd: dir, locale: "de", key: "greeting", value: "Hallo" });
  const teammateMemory = await readFile(cacheFilePath(dir), "utf8");
  await rejectEntry({ config, cwd: dir, locale: "de", key: "greeting", expectedValue: "Hallo" });
  await writeFile(cacheFilePath(dir), teammateMemory, "utf8");
  return dir;
}

describe("translate: memory never brings back a rejected value", () => {
  it("skips an exact memory hit whose value was rejected and asks the provider instead", async () => {
    const { dir, rejected } = await translatedThenRejectedWithTeammateMemory({
      greeting: "Hello",
      farewell: "Bye",
    });
    const next = fresh("[new]");

    const summary = await translate(
      { config: cfg(), cwd: dir },
      { createProvider: () => next.provider },
    );

    expect(next.calls.flatMap((call) => call.request.entries.map((entry) => entry.key))).toEqual([
      "greeting",
    ]);
    expect(summary.locales[0]?.cacheHits).toEqual([]);
    expect((await targetValues(dir)).greeting).toBe("[new] Hello");
    expect((await targetValues(dir)).greeting).not.toBe(rejected);
    expect((await loadProvenance({ cwd: dir })).locales.de?.greeting).toMatchObject({
      origin: "machine",
    });
  });

  it("skips a fuzzy memory hit whose value was rejected", async () => {
    const { dir, rejected } = await translatedThenRejectedWithTeammateMemory({
      greeting: "Hello there, dear friend",
    });
    await writeJsonFile(join(dir, "locales", "en.json"), { greeting: "Hello there, dear friend!" });
    const next = fresh("[new]");
    const config = cfg({ fuzzyCache: { enabled: true, threshold: 0.5 } });

    const summary = await translate({ config, cwd: dir }, { createProvider: () => next.provider });

    expect(next.calls).toHaveLength(1);
    expect(summary.locales[0]?.fuzzyHits).toEqual([]);
    expect((await targetValues(dir)).greeting).toBe("[new] Hello there, dear friend!");
    expect((await targetValues(dir)).greeting).not.toBe(rejected);
  });

  it("still reuses a memory hit whose value differs from the rejected one", async () => {
    const dir = await project({ greeting: "Hello" });
    const first = fresh("[old]");
    await translate({ config: cfg(), cwd: dir }, { createProvider: () => first.provider });
    await writeJsonFile(join(dir, PROVENANCE_FILE_NAME), {
      version: 1,
      locales: {
        de: {
          greeting: { origin: "machine", valueHash: valueHash("Other"), reviewState: "rejected" },
        },
      },
    });
    await rm(join(dir, "locales", "de.json"));
    await rm(join(dir, "verbatra.lock.json"));
    const next = fresh("[new]");

    const summary = await translate(
      { config: cfg(), cwd: dir },
      { createProvider: () => next.provider },
    );

    expect(next.calls).toHaveLength(0);
    expect(summary.locales[0]?.cacheHits).toEqual(["greeting"]);
    expect((await targetValues(dir)).greeting).toBe("[old] Hello");
  });

  it("leaves the key unfilled in human-only mode rather than reusing the rejected text", async () => {
    const dir = await editedThenRejectedWithTeammateMemory(humanOnly, { greeting: "Hello" });

    const summary = await translate({ config: humanOnly, cwd: dir });

    expect(summary.locales[0]?.unfilled).toEqual(["greeting"]);
    expect(summary.locales[0]?.cacheHits).toEqual([]);
    expect(await targetValues(dir)).not.toHaveProperty("greeting");
    expect((await loadProvenance({ cwd: dir })).locales.de?.greeting).toMatchObject({
      reviewState: "rejected",
    });
  });

  it("honours the rejection under humanEdits overwrite too", async () => {
    const { dir } = await translatedThenRejectedWithTeammateMemory({ greeting: "Hello" });
    const next = fresh("[new]");
    const createProvider: CreateProvider = () => next.provider;

    await translate({ config: cfg({ humanEdits: "overwrite" }), cwd: dir }, { createProvider });

    expect(next.calls).toHaveLength(1);
    expect((await targetValues(dir)).greeting).toBe("[new] Hello");
  });

  it("honours the rejection on a human-only dry run under humanEdits overwrite", async () => {
    const config: VerbatraConfig = { ...humanOnly, humanEdits: "overwrite" };
    const dir = await editedThenRejectedWithTeammateMemory(config, { greeting: "Hello" });

    const summary = await translate({ config, cwd: dir, dryRun: true });

    expect(summary.locales[0]?.unfilled).toEqual(["greeting"]);
  });

  it("ignores a corrupt provenance file on a human-only dry run under humanEdits overwrite", async () => {
    const config: VerbatraConfig = { ...humanOnly, humanEdits: "overwrite" };
    const dir = await editedThenRejectedWithTeammateMemory(config, { greeting: "Hello" });
    await writeFile(join(dir, PROVENANCE_FILE_NAME), "{not json", "utf8");

    const summary = await translate({ config, cwd: dir, dryRun: true });

    expect(summary.locales[0]?.cacheHits).toEqual(["greeting"]);
  });
});
