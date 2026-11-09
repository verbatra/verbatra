import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { contentHash } from "@verbatra/core";
import { AdapterRegistry, createDefaultRegistry } from "@verbatra/format-adapters";
import { describe, expect, it } from "vitest";
import type { VerbatraConfig } from "../config/schema.js";
import { defaultFs, type SdkFs } from "../fs.js";
import { localeLockPath, writeLockKeyFor } from "../lock/locale-write-lock.js";
import { valueHash } from "../lock/provenance-file.js";
import { baseConfig, makeTempDir, readJsonFile, writeJsonFile } from "../test-support.js";
import { check } from "./check.js";
import {
  applyValueReplace,
  previewValueReplace,
  type ValueReplaceEntryRef,
} from "./value-replace.js";

function refsOf(
  entries: readonly { locale: string; key: string; valueHash: string }[],
): ValueReplaceEntryRef[] {
  return entries.map(({ locale, key, valueHash: hash }) => ({ locale, key, valueHash: hash }));
}

function registryObservingLocks(
  format: "i18next-json" | "apple-xcstrings",
  expectedLocksFor: (locale: string) => readonly string[],
  seen: { reads: number; writes: number; unlocked: string[] },
): AdapterRegistry {
  const resolution = createDefaultRegistry().resolve("", { format });
  if (resolution.status !== "resolved") {
    throw new Error(`no adapter registered for ${format}`);
  }
  const base = resolution.adapter;
  const assertHeld = (call: string, locale: string): void => {
    const lockPaths = expectedLocksFor(locale);
    if (!lockPaths.some((lockPath) => existsSync(lockPath))) {
      seen.unlocked.push(`${call} ${locale}: no lock at ${lockPaths.join(" or ")}`);
    }
  };
  return new AdapterRegistry().register({
    ...base,
    read: async (filePath, locale) => {
      seen.reads += 1;
      assertHeld("read", locale);
      return base.read(filePath, locale);
    },
    write: async (resource, filePath, context) => {
      seen.writes += 1;
      assertHeld("write", resource.locale);
      return base.write(resource, filePath, context);
    },
  });
}

describe("applyValueReplace reads and writes only while it holds the locale write lock", () => {
  it("holds the locale's own lock around every read and write of a per-locale format", async () => {
    const dir = await makeTempDir();
    await mkdir(join(dir, "locales"));
    await writeJsonFile(join(dir, "locales", "en.json"), { a: "Hello" });
    await writeJsonFile(join(dir, "locales", "de.json"), { a: "Hallo X" });
    await writeJsonFile(join(dir, "locales", "fr.json"), { a: "Salut X" });
    const config = baseConfig({ targetLocales: ["de", "fr"], format: "i18next-json" });
    const seen = { reads: 0, writes: 0, unlocked: [] as string[] };
    const held = (locale: string): readonly string[] =>
      (locale === "en" ? ["de", "fr"] : [locale]).map((target) =>
        localeLockPath(dir, writeLockKeyFor("i18next-json", target)),
      );
    const registry = registryObservingLocks("i18next-json", held, seen);

    const result = await applyValueReplace(
      {
        config,
        cwd: dir,
        find: "X",
        replace: "Y",
        entries: [
          { locale: "de", key: "a", valueHash: valueHash("Hallo X") },
          { locale: "fr", key: "a", valueHash: valueHash("Salut X") },
        ],
        actor: "human",
      },
      { adapterRegistry: registry },
    );

    expect(result.localeFailures).toEqual([]);
    expect(result.counts.applied).toBe(2);
    expect(seen.reads).toBeGreaterThan(0);
    expect(seen.writes).toBe(2);
    expect(seen.unlocked).toEqual([]);
  });

  it("holds the single catalogue lock around every read and write of a shared-catalogue format", async () => {
    const dir = await makeTempDir();
    const unit = (value: string) => ({ stringUnit: { state: "translated", value } });
    await writeFile(
      join(dir, "Localizable.xcstrings"),
      JSON.stringify({
        sourceLanguage: "en",
        version: "1.0",
        strings: {
          a: { localizations: { en: unit("Hello"), de: unit("Hallo X"), fr: unit("Salut X") } },
        },
      }),
      "utf8",
    );
    const config: VerbatraConfig = baseConfig({
      targetLocales: ["de", "fr"],
      format: "apple-xcstrings",
      files: { pattern: "{locale}Localizable.xcstrings" },
    });
    const seen = { reads: 0, writes: 0, unlocked: [] as string[] };
    const registry = registryObservingLocks(
      "apple-xcstrings",
      () => [localeLockPath(dir, "_catalogue")],
      seen,
    );

    const result = await applyValueReplace(
      {
        config,
        cwd: dir,
        find: "X",
        replace: "Y",
        entries: [
          { locale: "de", key: "a", valueHash: valueHash("Hallo X") },
          { locale: "fr", key: "a", valueHash: valueHash("Salut X") },
        ],
        actor: "human",
      },
      { adapterRegistry: registry },
    );

    expect(writeLockKeyFor("apple-xcstrings", "de")).toBe("_catalogue");
    expect(result.localeFailures).toEqual([]);
    expect(result.counts.applied).toBe(2);
    expect(seen.reads).toBeGreaterThan(0);
    expect(seen.unlocked).toEqual([]);
  });
});

async function waitUntilBlocked<T>(
  dir: string,
  locale: string,
  start: (fs: SdkFs) => Promise<T>,
  whileBlocked: () => Promise<void>,
): Promise<T> {
  let blocked!: () => void;
  const reachedLock = new Promise<void>((resolve) => {
    blocked = resolve;
  });
  const fs: SdkFs = {
    ...defaultFs,
    createExclusive: async (path, data) => {
      const created = await defaultFs.createExclusive(path, data);
      if (!created && path.endsWith(`${locale}.lock`)) {
        blocked();
      }
      return created;
    },
  };
  const lockPath = localeLockPath(dir, locale);
  await mkdir(dirname(lockPath), { recursive: true });
  await writeFile(lockPath, JSON.stringify({ pid: 1, hostname: "another-machine" }), "utf8");
  const pending = start(fs);
  await reachedLock;
  await whileBlocked();
  await rm(lockPath);
  return pending;
}

describe("applyValueReplace decides from the files as they are once it holds the lock", () => {
  async function fixture(): Promise<{ dir: string; config: VerbatraConfig }> {
    const dir = await makeTempDir();
    await mkdir(join(dir, "locales"));
    await writeJsonFile(join(dir, "locales", "en.json"), { a: "Hello", b: "Bye" });
    await writeJsonFile(join(dir, "locales", "de.json"), { a: "Hallo X", b: "Tschuess X" });
    return { dir, config: baseConfig({ targetLocales: ["de"], format: "i18next-json" }) };
  }

  it("skips as protected a value whose provenance became human while it waited", async () => {
    const { dir, config } = await fixture();
    const listed = await previewValueReplace({ config, cwd: dir, find: "X", replace: "Y" });
    expect(listed.entries.map((entry) => entry.status)).toEqual(["ready", "ready"]);

    const result = await waitUntilBlocked(
      dir,
      "de",
      (fs) =>
        applyValueReplace(
          {
            config,
            cwd: dir,
            find: "X",
            replace: "Y",
            entries: refsOf(listed.entries),
            actor: "agent",
          },
          { fs },
        ),
      async () => {
        await writeJsonFile(join(dir, "verbatra.provenance.json"), {
          version: 1,
          locales: {
            de: {
              a: { origin: "human", valueHash: valueHash("Hallo X") },
              b: { origin: "machine", valueHash: valueHash("Tschuess X") },
            },
          },
        });
      },
    );

    expect(result.outcomes.map((outcome) => outcome.status)).toEqual(["skipped", "applied"]);
    expect(result.outcomes[0]).toMatchObject({ key: "a", reason: "protected" });
    expect((await readJsonFile(join(dir, "locales", "de.json"))) as object).toEqual({
      a: "Hallo X",
      b: "Tschuess Y",
    });
  }, 15_000);

  it("reports a key as stale when the lock file recorded another source text while it waited", async () => {
    const { dir, config } = await fixture();
    const listed = await previewValueReplace({ config, cwd: dir, find: "X", replace: "Y" });
    expect(listed.entries.map((entry) => entry.status)).toEqual(["ready", "ready"]);

    const result = await waitUntilBlocked(
      dir,
      "de",
      (fs) =>
        applyValueReplace(
          {
            config,
            cwd: dir,
            find: "X",
            replace: "Y",
            entries: refsOf(listed.entries),
            actor: "human",
          },
          { fs },
        ),
      async () => {
        await writeJsonFile(join(dir, "verbatra.lock.json"), {
          version: 1,
          locales: {
            de: {
              a: "hash-of-an-older-source",
              b: contentHash({
                key: "b",
                namespace: "en",
                value: "Bye",
                placeholders: [],
                isPlural: false,
              }),
            },
          },
        });
      },
    );

    expect(result.outcomes[0]).toMatchObject({ key: "a", status: "applied", staleSource: true });
    expect(result.outcomes[1]).toMatchObject({ key: "b", status: "applied", staleSource: false });
    const lock = (await readJsonFile(join(dir, "verbatra.lock.json"))) as {
      locales: Record<string, Record<string, string>>;
    };
    expect(lock.locales.de?.a).toBe("hash-of-an-older-source");
    const summary = await check({ config, cwd: dir });
    expect(summary.locales[0]).toMatchObject({ stale: 1, upToDate: 1 });
  }, 15_000);
});

describe("applyValueReplace for a locale whose state is recorded under a respelled code", () => {
  it("moves the lock and provenance state to the locale before it decides", async () => {
    const dir = await makeTempDir();
    await mkdir(join(dir, "locales"));
    await writeJsonFile(join(dir, "locales", "en.json"), { a: "Hello new", b: "Bye new" });
    await writeJsonFile(join(dir, "locales", "pt-BR.json"), { a: "Ola X", b: "Tchau X" });
    await writeJsonFile(join(dir, "verbatra.lock.json"), {
      version: 1,
      locales: { pt_BR: { b: "hash-of-the-old-source" } },
    });
    await writeJsonFile(join(dir, "verbatra.provenance.json"), {
      version: 1,
      locales: { pt_BR: { a: { origin: "human", valueHash: valueHash("Ola X") } } },
    });
    const config = baseConfig({ targetLocales: ["pt-BR"], format: "i18next-json" });
    const entries = [
      { locale: "pt-BR", key: "a", valueHash: valueHash("Ola X") },
      { locale: "pt-BR", key: "b", valueHash: valueHash("Tchau X") },
    ];

    const result = await applyValueReplace({
      config,
      cwd: dir,
      find: "X",
      replace: "Y",
      entries,
      actor: "human",
    });

    expect(result.outcomes[0]).toMatchObject({ key: "a", status: "skipped", reason: "protected" });
    expect(result.outcomes[1]).toMatchObject({ key: "b", status: "applied", staleSource: true });
    const summary = await check({ config, cwd: dir });
    expect(summary.locales[0]).toMatchObject({ stale: 1 });
  });
});
