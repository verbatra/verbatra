import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { computeFingerprint } from "../cache/fingerprint.js";
import type { VerbatraConfig } from "../config/schema.js";
import { defaultFs, type SdkFs } from "../fs.js";
import { type LockWaitEvent, lockFileGuardPath } from "../lock/locale-write-lock.js";
import { valueHash } from "../lock/provenance-file.js";
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
      'The state recorded under "pt_BR" in verbatra.lock.json, verbatra.provenance.json would be ' +
        'moved to "pt-BR" on a live run, the configured spelling of the same locale, so its ' +
        "lock-file baseline and cached translations apply to it again.",
    ]);
    expect(await localesOf(lockPath(dir))).toEqual(["pt_BR"]);
    expect(await memoryLocalesOf(dir)).toEqual(["pt_BR"]);
    expect(await localesOf(provenancePath(dir))).toEqual(["pt_BR"]);
  });

  it("protects a key a person wrote under the old code on a dry run as on a live run", async () => {
    const dir = await respelledProject();
    const provenance = (await readJsonFile(provenancePath(dir))) as LockDocument;
    await writeJsonFile(provenancePath(dir), {
      ...provenance,
      locales: {
        pt_BR: {
          ...(provenance.locales.pt_BR as LocaleBlocks),
          greeting: { origin: "human", valueHash: valueHash("[pt-BR] Hello") },
        },
      },
    });
    await changeSource(dir);
    const { provider } = makeStubProvider();

    const dry = await translate({ config: cfg(), cwd: dir, dryRun: true });
    const live = await translate({ config: cfg(), cwd: dir }, { createProvider: () => provider });

    expect(dry.locales[0]?.protected).toEqual([{ key: "greeting", reason: "human" }]);
    expect(live.locales[0]?.protected).toEqual(dry.locales[0]?.protected);
    expect(dry.locales[0]?.translated).toEqual(live.locales[0]?.translated);
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

function refusedGuard(dir: string, refusals: number): SdkFs {
  const guard = lockFileGuardPath(dir);
  let left = refusals;
  return {
    ...defaultFs,
    createExclusive: async (path, data) => {
      if (path === guard && left > 0) {
        left -= 1;
        return false;
      }
      return defaultFs.createExclusive(path, data);
    },
  };
}

function failingFirstWrite(path: string): SdkFs {
  let failed = false;
  return {
    ...defaultFs,
    writeFile: async (target, content) => {
      if (target === path && !failed) {
        failed = true;
        throw new Error("EROFS: read-only file system");
      }
      await defaultFs.writeFile(target, content);
    },
  };
}

async function holdGuard(dir: string): Promise<string> {
  const guard = lockFileGuardPath(dir);
  await mkdir(dirname(guard), { recursive: true });
  await writeFile(guard, JSON.stringify({ pid: 9999, hostname: "elsewhere" }), "utf8");
  return guard;
}

function skipNotices(summary: LocaleSummary | undefined): string[] {
  return (summary?.notices ?? [])
    .filter((notice) => notice.code === "LOCALE_STATE_CARRY_OVER_SKIPPED")
    .map((notice) => notice.message);
}

function sentKeys(calls: ReturnType<typeof makeStubProvider>["calls"]): string[] {
  return calls.flatMap((call) => call.request.entries.map((entry) => entry.key));
}

describe("translate: a locale whose respelled state could not be moved", () => {
  it("does not run the locale while the lock-file guard stays contended, and moves it next run", async () => {
    const dir = await respelledProject(["de", "pt-BR"]);
    await changeSource(dir);
    const localeFile = join(dir, "locales", "pt_BR.json");
    const before = await readFile(localeFile, "utf8");
    const { provider, calls } = makeStubProvider();
    const waits: LockWaitEvent[] = [];

    const summary = await translate(
      {
        config: cfg(["de", "pt-BR"]),
        cwd: dir,
        lockAcquireTimeoutMs: 20,
        onLockWait: (event) => waits.push(event),
      },
      { createProvider: () => provider, fs: refusedGuard(dir, 2) },
    );

    const ptBr = summary.locales.find((entry) => entry.locale === "pt-BR");
    expect(summary.succeeded).toEqual(["de"]);
    expect(summary.failed).toEqual(["pt-BR"]);
    expect(ptBr?.error?.code).toBe("LOCALE_STATE_NOT_CARRIED_OVER");
    expect(ptBr?.error?.message).toContain("the next run tries the move again");
    expect(skipNotices(ptBr)[0]).toContain(
      "The locale did not run, and the next run tries the move again.",
    );
    expect(waits[0]?.lockPath).toBe(lockFileGuardPath(dir));
    expect(sentKeys(calls)).toEqual(["greeting"]);
    expect(calls.every((call) => call.request.targetLocale === "de")).toBe(true);
    expect(await readFile(localeFile, "utf8")).toBe(before);
    expect(await localesOf(lockPath(dir))).toEqual(["de", "pt_BR"]);
    expect(await localesOf(provenancePath(dir))).toEqual(["de", "pt_BR"]);
    expect((await memoryLocalesOf(dir)).sort()).toEqual(["de", "pt_BR"]);

    const next = await translate(
      { config: cfg(["de", "pt-BR"]), cwd: dir },
      { createProvider: () => provider },
    );

    const retried = next.locales.find((entry) => entry.locale === "pt-BR");
    expect(retried?.status).toBe("succeeded");
    expect(retried?.translated).toEqual(["greeting"]);
    expect(carryNotices(retried)).toHaveLength(1);
    expect(await localesOf(lockPath(dir))).toEqual(["de", "pt-BR"]);
    expect(await localesOf(provenancePath(dir))).toEqual(["de", "pt-BR"]);
  });

  it("does not run the locale when the lock file cannot be written, and moves it next run", async () => {
    const dir = await respelledProject();
    await changeSource(dir);
    const { provider, calls } = makeStubProvider();

    const summary = await translate(
      { config: cfg(), cwd: dir },
      { createProvider: () => provider, fs: failingFirstWrite(lockPath(dir)) },
    );

    expect(summary.locales[0]?.error).toMatchObject({
      code: "LOCALE_STATE_NOT_CARRIED_OVER",
      message: expect.stringContaining("EROFS: read-only file system."),
    });
    expect(calls).toHaveLength(0);
    expect(await localesOf(lockPath(dir))).toEqual(["pt_BR"]);

    const next = await translate({ config: cfg(), cwd: dir }, { createProvider: () => provider });

    expect(next.locales[0]?.translated).toEqual(["greeting"]);
    expect(await localesOf(lockPath(dir))).toEqual(["pt-BR"]);
  });

  it("keeps a person's edit recorded under the old code when the provenance file cannot be written", async () => {
    const dir = await respelledProject();
    const provenance = (await readJsonFile(provenancePath(dir))) as LockDocument;
    await writeJsonFile(provenancePath(dir), {
      ...provenance,
      locales: {
        pt_BR: {
          ...(provenance.locales.pt_BR as LocaleBlocks),
          greeting: { origin: "human", valueHash: valueHash("[pt-BR] Hello") },
        },
      },
    });
    await changeSource(dir);
    const { provider, calls } = makeStubProvider();

    const summary = await translate(
      { config: cfg(), cwd: dir },
      { createProvider: () => provider, fs: failingFirstWrite(provenancePath(dir)) },
    );

    expect(summary.locales[0]?.error?.code).toBe("LOCALE_STATE_NOT_CARRIED_OVER");
    expect(calls).toHaveLength(0);
    expect(await localesOf(provenancePath(dir))).toEqual(["pt_BR"]);

    const next = await translate({ config: cfg(), cwd: dir }, { createProvider: () => provider });

    expect(next.locales[0]?.protected).toEqual([{ key: "greeting", reason: "human" }]);
    expect(sentKeys(calls)).toEqual([]);
    expect(await readJsonFile(join(dir, "locales", "pt_BR.json"))).toMatchObject({
      greeting: "[pt-BR] Hello",
    });
    expect(await localesOf(provenancePath(dir))).toEqual(["pt-BR"]);
  });

  it("still runs the locale when only the translation memory cannot be written", async () => {
    const dir = await respelledProject();
    await changeSource(dir);
    const { provider } = makeStubProvider();

    const summary = await translate(
      { config: cfg(), cwd: dir },
      { createProvider: () => provider, fs: failingFirstWrite(cachePath(dir)) },
    );

    expect(summary.locales[0]?.status).toBe("succeeded");
    expect(summary.locales[0]?.translated).toEqual(["greeting"]);
    expect(skipNotices(summary.locales[0])[0]).toContain("The translation memory is only a cache");
    expect(await localesOf(lockPath(dir))).toEqual(["pt-BR"]);
  });

  it("reports the locale as not planned on a dry run while another process holds the guard", async () => {
    const dir = await respelledProject(["de", "pt-BR"]);
    await changeSource(dir);
    const guard = await holdGuard(dir);

    const summary = await translate({ config: cfg(["de", "pt-BR"]), cwd: dir, dryRun: true });

    const ptBr = summary.locales.find((entry) => entry.locale === "pt-BR");
    expect(summary.failed).toEqual(["pt-BR"]);
    expect(ptBr?.error?.code).toBe("LOCALE_STATE_NOT_CARRIED_OVER");
    expect(ptBr?.error?.message).toContain(guard);
    expect(skipNotices(ptBr)[0]).toContain("A live run would not run the locale while that holds.");
    expect(summary.locales.find((entry) => entry.locale === "de")?.translated).toEqual([
      "greeting",
    ]);

    await rm(guard);
    const free = await translate({ config: cfg(["de", "pt-BR"]), cwd: dir, dryRun: true });

    expect(free.failed).toEqual([]);
    expect(free.locales.find((entry) => entry.locale === "pt-BR")?.translated).toEqual([
      "greeting",
    ]);
  });
});
