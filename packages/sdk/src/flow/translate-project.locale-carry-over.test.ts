import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { computeFingerprint } from "../cache/fingerprint.js";
import type { VerbatraConfig } from "../config/schema.js";
import {
  baseConfig,
  makeStubProvider,
  makeTempDir,
  readJsonFile,
  writeJsonFile,
} from "../test-support.js";
import type { LocaleSummary } from "./summary.js";
import { translate } from "./translate-project.js";

type LocaleBlocks = Record<string, unknown>;

interface LockDocument {
  readonly version: number;
  readonly locales: LocaleBlocks;
}

interface CacheDocument {
  readonly version: number;
  readonly entries: Record<string, LocaleBlocks>;
  readonly sources: Record<string, string>;
}

const cfg = (targetLocales: readonly string[] = ["pt-BR"]): VerbatraConfig =>
  baseConfig({
    targetLocales: [...targetLocales],
    files: { pattern: "locales/{locale}.json", localeStyle: "posix" },
  });

const lockPath = (dir: string): string => join(dir, "verbatra.lock.json");
const cachePath = (dir: string): string => join(dir, "verbatra.cache.json");
const provenancePath = (dir: string): string => join(dir, "verbatra.provenance.json");

function renamed(blocks: LocaleBlocks, from: string, to: string): LocaleBlocks {
  return Object.fromEntries(
    Object.entries(blocks).map(([locale, value]) => [locale === from ? to : locale, value]),
  );
}

async function respellState(dir: string, from: string, to: string): Promise<void> {
  const lock = (await readJsonFile(lockPath(dir))) as LockDocument;
  await writeJsonFile(lockPath(dir), { ...lock, locales: renamed(lock.locales, from, to) });
  const cache = (await readJsonFile(cachePath(dir))) as CacheDocument;
  const entries = Object.fromEntries(
    Object.entries(cache.entries).map(([fp, byLocale]) => [fp, renamed(byLocale, from, to)]),
  );
  await writeJsonFile(cachePath(dir), { ...cache, entries });
  const provenance = (await readJsonFile(provenancePath(dir))) as LockDocument;
  await writeJsonFile(provenancePath(dir), {
    ...provenance,
    locales: renamed(provenance.locales, from, to),
  });
}

async function respelledProject(targetLocales: readonly string[] = ["pt-BR"]): Promise<string> {
  const dir = await makeTempDir();
  await mkdir(join(dir, "locales"));
  await writeJsonFile(join(dir, "locales", "en.json"), { greeting: "Hello", farewell: "Bye" });
  const { provider } = makeStubProvider();
  await translate({ config: cfg(targetLocales), cwd: dir }, { createProvider: () => provider });
  await respellState(dir, "pt-BR", "pt_BR");
  return dir;
}

async function changeSource(dir: string): Promise<void> {
  await writeJsonFile(join(dir, "locales", "en.json"), {
    greeting: "Hello there",
    farewell: "Bye",
  });
}

async function localesOf(path: string): Promise<string[]> {
  return Object.keys(((await readJsonFile(path)) as LockDocument).locales).sort();
}

async function memoryLocalesOf(dir: string): Promise<string[]> {
  const cache = (await readJsonFile(cachePath(dir))) as CacheDocument;
  return [...new Set(Object.values(cache.entries).flatMap((byLocale) => Object.keys(byLocale)))];
}

function carryNotices(summary: LocaleSummary | undefined): string[] {
  return (summary?.notices ?? [])
    .filter((notice) => notice.code === "LOCALE_STATE_CARRIED_OVER")
    .map((notice) => notice.message);
}

describe("translate: carrying state over from a respelled locale code", () => {
  it("moves the lock block, so a source change made before the rename is retranslated", async () => {
    const dir = await respelledProject();
    await changeSource(dir);
    const { provider, calls } = makeStubProvider();

    const summary = await translate(
      { config: cfg(), cwd: dir },
      { createProvider: () => provider },
    );

    expect(calls.flatMap((call) => call.request.entries.map((entry) => entry.key))).toEqual([
      "greeting",
    ]);
    expect(summary.locales[0]?.translated).toEqual(["greeting"]);
    expect(await localesOf(lockPath(dir))).toEqual(["pt-BR"]);
    expect(await readJsonFile(join(dir, "locales", "pt_BR.json"))).toEqual({
      greeting: "[pt-BR] Hello there",
      farewell: "[pt-BR] Bye",
    });
  });

  it("reports the move once on the locale, naming both codes and every file it touched", async () => {
    const dir = await respelledProject();
    const { provider } = makeStubProvider();

    const summary = await translate(
      { config: cfg(), cwd: dir },
      { createProvider: () => provider },
    );

    expect(carryNotices(summary.locales[0])).toEqual([
      'The state recorded under "pt_BR" in verbatra.lock.json, verbatra.cache.json, ' +
        'verbatra.provenance.json was moved to "pt-BR", the configured spelling of the same ' +
        "locale, so its lock-file baseline and cached translations apply to it again.",
    ]);
  });

  it("moves the translation memory, so a missing key is filled from it without a provider call", async () => {
    const dir = await respelledProject();
    await writeJsonFile(join(dir, "locales", "pt_BR.json"), {});
    const { provider, calls } = makeStubProvider();

    const summary = await translate(
      { config: cfg(), cwd: dir },
      { createProvider: () => provider },
    );

    expect(calls).toHaveLength(0);
    expect([...(summary.locales[0]?.cacheHits ?? [])].sort()).toEqual(["farewell", "greeting"]);
    expect(await memoryLocalesOf(dir)).toEqual(["pt-BR"]);
  });

  it("moves the provenance records, keeping the record of a key the run did not touch", async () => {
    const dir = await respelledProject();
    const before = (await readJsonFile(provenancePath(dir))) as LockDocument;
    await changeSource(dir);
    const { provider } = makeStubProvider();

    await translate({ config: cfg(), cwd: dir }, { createProvider: () => provider });

    const after = (await readJsonFile(provenancePath(dir))) as LockDocument;
    expect(Object.keys(after.locales)).toEqual(["pt-BR"]);
    expect((after.locales["pt-BR"] as LocaleBlocks).farewell).toEqual(
      (before.locales.pt_BR as LocaleBlocks).farewell,
    );
  });

  it("never overwrites state the configured code already has", async () => {
    const dir = await respelledProject();
    const lock = (await readJsonFile(lockPath(dir))) as LockDocument;
    const own = { greeting: "own-hash" };
    await writeJsonFile(lockPath(dir), { ...lock, locales: { ...lock.locales, "pt-BR": own } });
    const { provider, calls } = makeStubProvider();

    const summary = await translate(
      { config: cfg(), cwd: dir },
      { createProvider: () => provider },
    );

    expect(calls).toHaveLength(0);
    expect(summary.locales[0]?.cacheHits).toEqual(["greeting"]);
    expect(await localesOf(lockPath(dir))).toEqual(["pt-BR", "pt_BR"]);
    expect(carryNotices(summary.locales[0])[0]).toContain(
      "in verbatra.cache.json, verbatra.provenance.json was moved",
    );
  });

  it("moves nothing when two spellings of the code compete for it", async () => {
    const dir = await respelledProject();
    const lock = (await readJsonFile(lockPath(dir))) as LockDocument;
    await writeJsonFile(lockPath(dir), {
      ...lock,
      locales: { ...lock.locales, pt_br: lock.locales.pt_BR },
    });
    const { provider } = makeStubProvider();

    const summary = await translate(
      { config: cfg(), cwd: dir },
      { createProvider: () => provider },
    );

    expect(await localesOf(lockPath(dir))).toEqual(["pt-BR", "pt_BR", "pt_br"]);
    expect(carryNotices(summary.locales[0])[0]).not.toContain("verbatra.lock.json");
  });

  it("plans with the moved state on a dry run but writes nothing", async () => {
    const dir = await respelledProject();
    await changeSource(dir);

    const summary = await translate({ config: cfg(), cwd: dir, dryRun: true });

    expect(summary.locales[0]?.translated).toEqual(["greeting"]);
    expect(carryNotices(summary.locales[0])).toEqual([
      'The state recorded under "pt_BR" in verbatra.lock.json would be moved to "pt-BR" on a ' +
        "live run, the configured spelling of the same locale, so its lock-file baseline and " +
        "cached translations apply to it again.",
    ]);
    expect(await localesOf(lockPath(dir))).toEqual(["pt_BR"]);
    expect(await memoryLocalesOf(dir)).toEqual(["pt_BR"]);
  });

  it("plans with the moved memory on a human-only dry run", async () => {
    const dir = await respelledProject();
    await writeJsonFile(join(dir, "locales", "pt_BR.json"), {});
    const config: VerbatraConfig = { ...cfg(), provider: { id: "none", options: {} } };
    const cache = (await readJsonFile(cachePath(dir))) as CacheDocument;
    await writeJsonFile(cachePath(dir), {
      ...cache,
      entries: { [computeFingerprint(config, "pt-BR")]: Object.values(cache.entries)[0] },
    });

    const summary = await translate({ config, cwd: dir, dryRun: true });

    expect([...(summary.locales[0]?.cacheHits ?? [])].sort()).toEqual(["farewell", "greeting"]);
    expect(await memoryLocalesOf(dir)).toEqual(["pt_BR"]);
  });

  it("leaves the translation memory alone when the run does not use it", async () => {
    const dir = await respelledProject();
    const { provider } = makeStubProvider();

    await translate({ config: cfg(), cwd: dir, cache: false }, { createProvider: () => provider });

    expect(await localesOf(lockPath(dir))).toEqual(["pt-BR"]);
    expect(await memoryLocalesOf(dir)).toEqual(["pt_BR"]);
  });

  it("moves nothing for a configured locale the run did not select", async () => {
    const dir = await respelledProject(["de", "pt-BR"]);
    const { provider } = makeStubProvider();

    const summary = await translate(
      { config: cfg(["de", "pt-BR"]), cwd: dir, locales: ["de"] },
      { createProvider: () => provider },
    );

    expect(await localesOf(lockPath(dir))).toEqual(["de", "pt_BR"]);
    expect(carryNotices(summary.locales[0])).toEqual([]);
  });
});
