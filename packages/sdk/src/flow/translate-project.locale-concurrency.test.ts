import { mkdir, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  TranslateRequest,
  TranslateResult,
  TranslationProvider,
} from "@verbatra/ai-providers";
import type { PlaceholderIntegrityResult } from "@verbatra/core";
import { describe, expect, it } from "vitest";
import type { VerbatraConfig } from "../config/schema.js";
import { SdkError } from "../errors.js";
import { type BoundedFileRead, defaultFs, type SdkFs } from "../fs.js";
import { lockFilePath } from "../lock/lock-file.js";
import {
  baseConfig,
  makeStubProvider,
  makeTempDir,
  readTextFile,
  writeJsonFile,
} from "../test-support.js";
import { translate } from "./translate-project.js";

const PASS: PlaceholderIntegrityResult = {
  matches: true,
  missing: [],
  extra: [],
  reordered: false,
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

interface ProbeStats {
  readonly maxInFlight: number;
  readonly arrived: number;
}

interface ProbeOptions {
  readonly gateAt?: number;
  readonly delayMs?: number;
  readonly delayByLocale?: Readonly<Record<string, number>>;
}

function makeConcurrencyProbe(options: ProbeOptions): {
  readonly provider: TranslationProvider;
  readonly stats: () => ProbeStats;
} {
  let inFlight = 0;
  let maxInFlight = 0;
  let arrived = 0;
  let openGate: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    openGate = resolve;
  });

  async function wait(targetLocale: string): Promise<void> {
    if (options.gateAt !== undefined) {
      await gate;
      return;
    }
    const ms = options.delayByLocale?.[targetLocale] ?? options.delayMs ?? 0;
    if (ms > 0) {
      await sleep(ms);
    }
  }

  const provider: TranslationProvider = {
    id: "probe",
    kind: "llm",
    supportsGlossary: true,
    translateBatch: async (request: TranslateRequest): Promise<TranslateResult> => {
      inFlight += 1;
      if (inFlight > maxInFlight) {
        maxInFlight = inFlight;
      }
      arrived += 1;
      if (options.gateAt !== undefined && arrived >= options.gateAt) {
        openGate();
      }
      await wait(request.targetLocale);
      const values = new Map<string, string>();
      const integrity = new Map<string, PlaceholderIntegrityResult>();
      for (const entry of request.entries) {
        values.set(entry.key, `[${request.targetLocale}] ${entry.value}`);
        integrity.set(entry.key, PASS);
      }
      inFlight -= 1;
      return { values, integrity };
    },
  };
  return { provider, stats: () => ({ maxInFlight, arrived }) };
}

async function project(source: Record<string, unknown>): Promise<string> {
  const dir = await makeTempDir();
  await mkdir(join(dir, "locales"));
  await writeJsonFile(join(dir, "locales", "en.json"), source);
  return dir;
}

function targetText(dir: string, locale: string): Promise<string> {
  return readTextFile(join(dir, "locales", `${locale}.json`));
}

const cfg = (
  targetLocales: readonly string[],
  overrides: Partial<VerbatraConfig> = {},
): VerbatraConfig => baseConfig({ targetLocales: [...targetLocales], ...overrides });

describe("translate: bounded locale-level concurrency", () => {
  it("runs no more than the configured limit of locales concurrently", async () => {
    const dir = await project({ a: "A" });
    const { provider, stats } = makeConcurrencyProbe({ gateAt: 2 });

    const summary = await translate(
      { config: cfg(["de", "fr", "es", "it"]), cwd: dir, concurrency: 2 },
      { createProvider: () => provider },
    );

    expect(summary.failed).toEqual([]);
    expect(stats().maxInFlight).toBeLessThanOrEqual(2);
    expect(stats().maxInFlight).toBe(2);
  });

  it("bounds in-flight calls to the limit when the limit is below the locale count", async () => {
    const dir = await project({ a: "A" });
    const { provider, stats } = makeConcurrencyProbe({ gateAt: 3 });

    const summary = await translate(
      { config: cfg(["de", "fr", "es", "it", "pt", "nl"]), cwd: dir, concurrency: 3 },
      { createProvider: () => provider },
    );

    expect(summary.failed).toEqual([]);
    expect(stats().maxInFlight).toBeLessThanOrEqual(3);
    expect(stats().maxInFlight).toBe(3);
  });

  it("runs strictly serially by default (concurrency unset), never overlapping provider calls", async () => {
    const dir = await project({ a: "A" });
    const { provider, stats } = makeConcurrencyProbe({ delayMs: 30 });

    const summary = await translate(
      { config: cfg(["de", "fr", "es", "it"]), cwd: dir },
      { createProvider: () => provider },
    );

    expect(summary.failed).toEqual([]);
    expect(stats().arrived).toBe(4);
    expect(stats().maxInFlight).toBe(1);
  });

  it("orders RunSummary.locales and written files by source order regardless of completion order", async () => {
    const targets = ["de", "fr", "es", "it"] as const;
    const source = { a: "A", b: "B" };

    const serialDir = await project(source);
    const serial = await translate(
      { config: cfg(targets), cwd: serialDir },
      { createProvider: () => makeStubProvider().provider },
    );

    const concurrentDir = await project(source);
    const delayByLocale = { de: 40, fr: 30, es: 20, it: 10 };
    const { provider } = makeConcurrencyProbe({ delayByLocale });
    const concurrent = await translate(
      { config: cfg(targets), cwd: concurrentDir, concurrency: 4 },
      { createProvider: () => provider },
    );

    expect(serial.locales.map((locale) => locale.locale)).toEqual([...targets]);
    expect(concurrent.locales.map((locale) => locale.locale)).toEqual([...targets]);
    expect(serial.failed).toEqual([]);
    expect(concurrent.failed).toEqual([]);

    for (const locale of targets) {
      expect(await targetText(concurrentDir, locale)).toEqual(await targetText(serialDir, locale));
    }
  });

  it("produces a byte-identical lock file across two default (serial) runs over the same fixture", async () => {
    const targets = ["de", "fr", "es"] as const;
    const source = { a: "A", b: "B" };

    const firstDir = await project(source);
    await translate(
      { config: cfg(targets), cwd: firstDir },
      { createProvider: () => makeStubProvider().provider },
    );

    const secondDir = await project(source);
    await translate(
      { config: cfg(targets), cwd: secondDir },
      { createProvider: () => makeStubProvider().provider },
    );

    expect(await readTextFile(lockFilePath(secondDir))).toEqual(
      await readTextFile(lockFilePath(firstDir)),
    );
  });

  it("writes a lock file byte-identical to a serial run when locales complete in reverse order under concurrency", async () => {
    const targets = ["de", "fr", "es", "it"] as const;
    const source = { a: "A", b: "B" };

    const serialDir = await project(source);
    await translate(
      { config: cfg(targets), cwd: serialDir },
      { createProvider: () => makeStubProvider().provider },
    );

    const concurrentDir = await project(source);
    const delayByLocale = { de: 40, fr: 30, es: 20, it: 10 };
    const { provider } = makeConcurrencyProbe({ delayByLocale });
    await translate(
      { config: cfg(targets), cwd: concurrentDir, concurrency: 4 },
      { createProvider: () => provider },
    );

    expect(await readTextFile(lockFilePath(concurrentDir))).toEqual(
      await readTextFile(lockFilePath(serialDir)),
    );
  });

  it("refuses concurrency greater than 1 on a live budgeted run before constructing the provider", async () => {
    let providerConstructed = false;
    await expect(
      translate(
        { config: cfg(["de", "fr"], { maxTokens: 1000 }), cwd: "/nonexistent", concurrency: 2 },
        {
          createProvider: () => {
            providerConstructed = true;
            return makeStubProvider().provider;
          },
        },
      ),
    ).rejects.toMatchObject({ code: "CONCURRENCY_BUDGET_CONFLICT" });
    expect(providerConstructed).toBe(false);
  });

  it("keeps the refusal on the ground that concurrent locales withhold unpredictably, not that they overspend", async () => {
    const error = await translate({
      config: cfg(["de", "fr"], { maxTokens: 1000 }),
      cwd: "/nonexistent",
      concurrency: 2,
    }).then(
      () => undefined,
      (thrown: unknown) => thrown,
    );

    expect(error).toMatchObject({ code: "CONCURRENCY_BUDGET_CONFLICT" });
    const message = (error as { message: string }).message;
    expect(message).toContain("which locale loses its remaining work");
    expect(message).not.toContain("overshoot");
  });

  it("allows concurrency greater than 1 with a budget on a dry run", async () => {
    const dir = await project({ a: "A" });
    const summary = await translate({
      config: cfg(["de", "fr"], { maxTokens: 1000 }),
      cwd: dir,
      concurrency: 2,
      dryRun: true,
    });
    expect(summary.dryRun).toBe(true);
    expect(summary.locales.map((locale) => locale.locale)).toEqual(["de", "fr"]);
  });

  it("allows concurrency of exactly 1 with a budget on a live run", async () => {
    const dir = await project({ a: "A" });
    const summary = await translate(
      { config: cfg(["de"], { maxTokens: 1000 }), cwd: dir, concurrency: 1 },
      { createProvider: () => makeStubProvider().provider },
    );
    expect(summary.failed).toEqual([]);
  });

  it.each([0, -3, 1.5, Number.NaN])(
    "rejects a non-positive or non-integer concurrency (%s) with CONCURRENCY_INVALID",
    async (value) => {
      await expect(
        translate({ config: cfg(["de"]), cwd: "/nonexistent", concurrency: value, dryRun: true }),
      ).rejects.toMatchObject({ code: "CONCURRENCY_INVALID" });
    },
  );

  it("throws a structured SdkError for an invalid concurrency, not a generic Error", async () => {
    await expect(
      translate({ config: cfg(["de"]), cwd: "/nonexistent", concurrency: 0, dryRun: true }),
    ).rejects.toBeInstanceOf(SdkError);
  });
});

function fsWithOneCorruptLockRead(dir: string): SdkFs {
  const lockPath = lockFilePath(dir);
  let lockReads = 0;
  return {
    ...defaultFs,
    readFileBounded: async (path: string, maxBytes: number): Promise<BoundedFileRead> => {
      if (path === lockPath) {
        lockReads += 1;
        if (lockReads === 1) {
          return { kind: "ok", content: "{ not json" };
        }
      }
      return defaultFs.readFileBounded(path, maxBytes);
    },
  };
}

async function heldLockFiles(dir: string): Promise<string[]> {
  try {
    return (await readdir(join(dir, ".verbatra-local", "locks"))).sort();
  } catch {
    return [];
  }
}

describe("translate: a whole-run failure under concurrency", () => {
  it("claims no further locale once one worker raises a whole-run failure", async () => {
    const dir = await project({ a: "A" });
    const { provider, stats } = makeConcurrencyProbe({ delayMs: 120 });

    await expect(
      translate(
        { config: cfg(["de", "fr", "es", "pt", "nl"]), cwd: dir, concurrency: 3 },
        { createProvider: () => provider, fs: fsWithOneCorruptLockRead(dir) },
      ),
    ).rejects.toMatchObject({ code: "LOCK_FILE_INVALID" });

    await sleep(300);

    expect(stats().arrived).toBe(2);
  });

  it("writes no target file for a locale that was never claimed", async () => {
    const dir = await project({ a: "A" });
    const { provider } = makeConcurrencyProbe({ delayMs: 120 });

    await expect(
      translate(
        { config: cfg(["de", "fr", "es", "pt", "nl"]), cwd: dir, concurrency: 3 },
        { createProvider: () => provider, fs: fsWithOneCorruptLockRead(dir) },
      ),
    ).rejects.toMatchObject({ code: "LOCK_FILE_INVALID" });
    await sleep(300);

    await expect(targetText(dir, "pt")).rejects.toThrow();
    await expect(targetText(dir, "nl")).rejects.toThrow();
  });

  it("releases every in-flight worker's write lock before translate() settles", async () => {
    const dir = await project({ a: "A" });
    const { provider } = makeConcurrencyProbe({ delayMs: 120 });

    await expect(
      translate(
        { config: cfg(["de", "fr", "es", "pt", "nl"]), cwd: dir, concurrency: 3 },
        { createProvider: () => provider, fs: fsWithOneCorruptLockRead(dir) },
      ),
    ).rejects.toMatchObject({ code: "LOCK_FILE_INVALID" });

    expect(await heldLockFiles(dir)).toEqual([]);
  });

  it("leaves no orphaned lock when every locale hits the corrupt lock file", async () => {
    const dir = await project({ a: "A" });
    await writeFile(lockFilePath(dir), "{ not json", "utf8");
    const { provider } = makeConcurrencyProbe({ delayMs: 5 });

    await expect(
      translate(
        { config: cfg(["de", "fr", "es", "pt"]), cwd: dir, concurrency: 3 },
        { createProvider: () => provider },
      ),
    ).rejects.toMatchObject({ code: "LOCK_FILE_INVALID" });

    expect(await heldLockFiles(dir)).toEqual([]);
  });

  it("still isolates a per-locale failure without aborting the other locales", async () => {
    const dir = await project({ a: "A" });
    const provider: TranslationProvider = {
      id: "one-bad-locale",
      kind: "llm",
      supportsGlossary: true,
      translateBatch: async (request: TranslateRequest): Promise<TranslateResult> => {
        if (request.targetLocale === "fr") {
          throw new Error("provider blew up for fr");
        }
        const values = new Map<string, string>();
        const integrity = new Map<string, PlaceholderIntegrityResult>();
        for (const entry of request.entries) {
          values.set(entry.key, `[${request.targetLocale}] ${entry.value}`);
          integrity.set(entry.key, PASS);
        }
        return { values, integrity };
      },
    };

    const summary = await translate(
      { config: cfg(["de", "fr", "es"]), cwd: dir, concurrency: 3 },
      { createProvider: () => provider },
    );

    expect(summary.failed).toEqual(["fr"]);
    expect([...summary.succeeded].sort()).toEqual(["de", "es"]);
  });

  it("is unchanged at the default serial concurrency: the failure still propagates", async () => {
    const dir = await project({ a: "A" });
    await writeFile(lockFilePath(dir), "{ not json", "utf8");
    const { provider } = makeConcurrencyProbe({});

    await expect(
      translate({ config: cfg(["de", "fr"]), cwd: dir }, { createProvider: () => provider }),
    ).rejects.toMatchObject({ code: "LOCK_FILE_INVALID" });

    expect(await heldLockFiles(dir)).toEqual([]);
  });
});
