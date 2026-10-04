import { mkdir, readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  ProviderError,
  type TranslateRequest,
  type TranslateResult,
  type TranslationProvider,
} from "@verbatra/ai-providers";
import type { PlaceholderIntegrityResult } from "@verbatra/core";
import { describe, expect, it } from "vitest";
import type { VerbatraConfig } from "../config/schema.js";
import { defaultFs } from "../fs.js";
import { localeLockPath } from "../lock/locale-write-lock.js";
import { lockFilePath } from "../lock/lock-file.js";
import { runStatusFilePath } from "../run-status/run-status-file.js";
import {
  baseConfig,
  deferred,
  makeStubProvider,
  makeTempDir,
  readJsonFile,
  writeJsonFile,
} from "../test-support.js";
import { editEntry } from "./edit-entry.js";
import { retranslateEntry } from "./retranslate-entry.js";
import type { LocaleSummary, RunSummary } from "./summary.js";
import { translate } from "./translate-project.js";

const PASS: PlaceholderIntegrityResult = {
  matches: true,
  missing: [],
  extra: [],
  reordered: false,
};

interface GatedProvider {
  readonly provider: TranslationProvider;
  readonly requests: TranslateRequest[];
  readonly arrival: (count: number) => Promise<void>;
}

function answer(request: TranslateRequest): TranslateResult {
  const values = new Map<string, string>();
  const integrity = new Map<string, PlaceholderIntegrityResult>();
  for (const entry of request.entries) {
    values.set(entry.key, `[${request.targetLocale}] ${entry.value}`);
    integrity.set(entry.key, PASS);
  }
  return { values, integrity };
}

function abandoned(signal: AbortSignal | undefined): Promise<never> {
  return new Promise((_resolve, reject) => {
    signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
  });
}

function gatedProvider(answerFirst = 0): GatedProvider {
  const requests: TranslateRequest[] = [];
  const waiters: { readonly count: number; readonly resolve: () => void }[] = [];
  const provider: TranslationProvider = {
    id: "gated",
    kind: "llm",
    supportsGlossary: true,
    translateBatch: async (request) => {
      requests.push(request);
      for (const waiter of waiters.filter((entry) => entry.count <= requests.length)) {
        waiter.resolve();
      }
      return requests.length <= answerFirst ? answer(request) : abandoned(request.signal);
    },
  };
  function arrival(count: number): Promise<void> {
    if (requests.length >= count) {
      return Promise.resolve();
    }
    const gate = deferred();
    waiters.push({ count, resolve: gate.resolve });
    return gate.promise;
  }
  return { provider, requests, arrival };
}

async function project(
  source: Record<string, unknown> = { a: "Alpha", b: "Beta", c: "Gamma" },
): Promise<string> {
  const dir = await makeTempDir();
  await mkdir(join(dir, "locales"));
  await writeJsonFile(join(dir, "locales", "en.json"), source);
  return dir;
}

function locale(summary: RunSummary, code: string): LocaleSummary {
  const found = summary.locales.find((entry) => entry.locale === code);
  if (found === undefined) {
    throw new Error(`no summary for ${code}`);
  }
  return found;
}

async function heldLocks(dir: string): Promise<string[]> {
  try {
    return (await readdir(dirname(localeLockPath(dir, "de")))).filter((name) =>
      name.endsWith(".lock"),
    );
  } catch {
    return [];
  }
}

function noticeCodes(summary: LocaleSummary): string[] {
  return summary.notices.map((notice) => notice.code);
}

const config = (overrides: Partial<VerbatraConfig> = {}): VerbatraConfig =>
  baseConfig({ targetLocales: ["de"], maxBatchSize: 1, ...overrides });

describe("translate: cancelling a running locale", () => {
  it("keeps the batches that finished, leaves the rest pending, and reports the locale partial", async () => {
    const dir = await project();
    const gated = gatedProvider(1);
    const controller = new AbortController();

    const running = translate(
      { config: config(), cwd: dir, signal: controller.signal },
      { createProvider: () => gated.provider },
    );
    await gated.arrival(2);
    controller.abort();
    const summary = await running;

    const de = locale(summary, "de");
    expect(summary.cancelled).toBe(true);
    expect(summary.partial).toEqual(["de"]);
    expect(de.translated).toEqual(["a"]);
    expect(de.providerFailures).toEqual([]);
    expect(noticeCodes(de)).toEqual(["RUN_CANCELLED"]);
    expect(de.notices[0]?.message).toContain("2 keys were not translated");
    expect(gated.requests).toHaveLength(2);
    expect(gated.requests[1]?.signal).toBe(controller.signal);
    expect(await readJsonFile(join(dir, "locales", "de.json"))).toEqual({ a: "[de] Alpha" });
    const lock = (await readJsonFile(lockFilePath(dir))) as {
      locales: Record<string, Record<string, string>>;
    };
    expect(Object.keys(lock.locales.de ?? {})).toEqual(["a"]);
    expect(await defaultFs.fileExists(runStatusFilePath(dir))).toBe(true);
    expect(await heldLocks(dir)).toEqual([]);
  });

  it("translates the pending keys on the next run", async () => {
    const dir = await project();
    const gated = gatedProvider(1);
    const controller = new AbortController();
    const running = translate(
      { config: config(), cwd: dir, signal: controller.signal },
      { createProvider: () => gated.provider },
    );
    await gated.arrival(2);
    controller.abort();
    await running;
    const stub = makeStubProvider();

    const next = await translate(
      { config: config(), cwd: dir },
      { createProvider: () => stub.provider },
    );

    expect(next.cancelled).toBeUndefined();
    expect(locale(next, "de").translated).toEqual(["b", "c"]);
    expect(locale(next, "de").status).toBe("succeeded");
  });

  it("gives up a plural generation request in flight", async () => {
    const dir = await project({ item_one: "{{count}} item", item_other: "{{count}} items" });
    const gated = gatedProvider(1);
    const controller = new AbortController();

    const running = translate(
      {
        config: config({ targetLocales: ["pl"], maxBatchSize: 10 }),
        cwd: dir,
        generatePlurals: true,
        signal: controller.signal,
      },
      { createProvider: () => gated.provider },
    );
    await gated.arrival(2);
    controller.abort();
    const pl = locale(await running, "pl");

    expect(pl.status).toBe("partial");
    expect(pl.translated).toEqual(["item_one", "item_other"]);
    expect(pl.generated).toEqual([]);
    expect(pl.providerFailures).toEqual([]);
    expect(noticeCodes(pl)).toEqual(["RUN_CANCELLED"]);
  });

  it("sends no plural generation request once the run is cancelled", async () => {
    const dir = await project({ item_one: "{{count}} item", item_other: "{{count}} items" });
    const gated = gatedProvider();
    const controller = new AbortController();

    const running = translate(
      {
        config: config({ targetLocales: ["pl"], maxBatchSize: 10 }),
        cwd: dir,
        generatePlurals: true,
        signal: controller.signal,
      },
      { createProvider: () => gated.provider },
    );
    await gated.arrival(1);
    controller.abort();
    const pl = locale(await running, "pl");

    expect(gated.requests).toHaveLength(1);
    expect(pl.status).toBe("partial");
    expect(pl.generated).toEqual([]);
    expect(noticeCodes(pl)).toEqual(["RUN_CANCELLED"]);
    expect(await defaultFs.fileExists(join(dir, "locales", "pl.json"))).toBe(false);
  });

  it("drops an abandoned suggestion without a status and leaves the other keys pending", async () => {
    const dir = await project({ greeting: "Hello", farewell: "Bye" });
    await translate(
      { config: config(), cwd: dir },
      { createProvider: () => makeStubProvider().provider },
    );
    await editEntry({ config: config(), cwd: dir, locale: "de", key: "greeting", value: "Hallo" });
    await writeJsonFile(join(dir, "locales", "en.json"), { greeting: "Hi", farewell: "Bye now" });
    const gated = gatedProvider();
    const controller = new AbortController();

    const running = translate(
      {
        config: config({ humanEdits: "suggest", maxBatchSize: 10 }),
        cwd: dir,
        cache: false,
        signal: controller.signal,
      },
      { createProvider: () => gated.provider },
    );
    await gated.arrival(1);
    controller.abort();
    const de = locale(await running, "de");

    expect(de.protected).toEqual([{ key: "greeting", reason: "human" }]);
    expect(de.status).toBe("partial");
    expect(de.notices.find((notice) => notice.code === "RUN_CANCELLED")?.message).toContain(
      "1 key was not translated",
    );
    expect(await readJsonFile(join(dir, "locales", "de.json"))).toEqual({
      greeting: "Hallo",
      farewell: "[de] Bye",
    });
  });
});

describe("translate: cancelling never hides a real failure", () => {
  it("keeps a locale failed when its finished batch failed before the cancellation", async () => {
    const dir = await project();
    const controller = new AbortController();
    const requests: TranslateRequest[] = [];
    const arrived = deferred();
    const provider: TranslationProvider = {
      id: "failing",
      kind: "llm",
      supportsGlossary: true,
      translateBatch: async (request) => {
        requests.push(request);
        if (requests.length === 1) {
          throw new ProviderError("PROVIDER_UNAVAILABLE", "server error");
        }
        arrived.resolve();
        return abandoned(request.signal);
      },
    };

    const running = translate(
      { config: config(), cwd: dir, signal: controller.signal },
      { createProvider: () => provider },
    );
    await arrived.promise;
    controller.abort();
    const summary = await running;

    const de = locale(summary, "de");
    expect(summary.cancelled).toBe(true);
    expect(de.status).toBe("failed");
    expect(de.providerFailures).toEqual(["a"]);
    expect(noticeCodes(de)).toEqual(["SUB_BATCH_FAILED", "RUN_CANCELLED"]);
  });

  it("records a provider's own failure that arrives with the abort as a provider failure", async () => {
    const dir = await project();
    const controller = new AbortController();
    const provider: TranslationProvider = {
      id: "failing",
      kind: "llm",
      supportsGlossary: true,
      translateBatch: async () => {
        controller.abort();
        throw new ProviderError("PROVIDER_UNAVAILABLE", "server error");
      },
    };

    const summary = await translate(
      { config: config({ maxBatchSize: 10 }), cwd: dir, signal: controller.signal },
      { createProvider: () => provider },
    );

    const de = locale(summary, "de");
    expect(summary.cancelled).toBeUndefined();
    expect(de.status).toBe("failed");
    expect(de.providerFailures).toEqual(["a", "b", "c"]);
    expect(noticeCodes(de)).toEqual(["SUB_BATCH_FAILED"]);
  });

  it("does not report a run cancelled when the abort arrives after every locale finished", async () => {
    const dir = await project();
    const controller = new AbortController();

    const summary = await translate(
      {
        config: config({ targetLocales: ["de", "fr"] }),
        cwd: dir,
        signal: controller.signal,
        onProgress: (event) => {
          if (event.type === "run-finished") {
            controller.abort();
          }
        },
      },
      { createProvider: () => makeStubProvider().provider },
    );

    expect(controller.signal.aborted).toBe(true);
    expect("cancelled" in summary).toBe(false);
    expect(summary.succeeded).toEqual(["de", "fr"]);
  });
});

describe("translate: cancelling a locale whose keys share or split a request", () => {
  it("leaves keys that share a cancelled key's source text pending with it", async () => {
    const dir = await project({ a: "Same", b: "Same", c: "Other" });
    const gated = gatedProvider();
    const controller = new AbortController();

    const running = translate(
      { config: config({ maxBatchSize: 10 }), cwd: dir, signal: controller.signal },
      { createProvider: () => gated.provider },
    );
    await gated.arrival(1);
    controller.abort();
    const de = locale(await running, "de");

    expect(gated.requests[0]?.entries.map((entry) => entry.key)).toEqual(["a", "c"]);
    expect(de.providerFailures).toEqual([]);
    expect(de.notices[0]?.message).toContain("3 keys were not translated");
  });

  it("sends no second half of a re-split request once the run is cancelled", async () => {
    const dir = await project({ a: "Alpha", b: "Beta" });
    const controller = new AbortController();
    const requests: TranslateRequest[] = [];
    const provider: TranslationProvider = {
      id: "splitting",
      kind: "llm",
      supportsGlossary: true,
      translateBatch: async (request) => {
        requests.push(request);
        if (requests.length === 1) {
          throw new ProviderError("OUTPUT_TRUNCATED", "output was cut off");
        }
        controller.abort();
        return answer(request);
      },
    };

    const summary = await translate(
      { config: config({ maxBatchSize: 10 }), cwd: dir, signal: controller.signal },
      { createProvider: () => provider },
    );

    const de = locale(summary, "de");
    expect(requests).toHaveLength(2);
    expect(de.translated).toEqual(["a"]);
    expect(de.status).toBe("partial");
    expect(noticeCodes(de)).toEqual(["RUN_CANCELLED"]);
  });
});

describe("translate: cancelling before or between locales", () => {
  it("starts no locale when the signal is already aborted, and still records the run", async () => {
    const dir = await project();
    const stub = makeStubProvider();

    const summary = await translate(
      { config: config({ targetLocales: ["de", "fr"] }), cwd: dir, signal: AbortSignal.abort() },
      { createProvider: () => stub.provider },
    );

    expect(summary.cancelled).toBe(true);
    expect(summary.failed).toEqual(["de", "fr"]);
    expect(summary.locales.map((entry) => entry.error?.code)).toEqual([
      "RUN_CANCELLED",
      "RUN_CANCELLED",
    ]);
    expect(stub.calls).toHaveLength(0);
    expect(await defaultFs.fileExists(join(dir, "locales", "de.json"))).toBe(false);
    expect(await defaultFs.fileExists(runStatusFilePath(dir))).toBe(true);
  });

  it("only stops a dry run early", async () => {
    const dir = await project();

    const aborted = await translate({
      config: config({ targetLocales: ["de", "fr"] }),
      cwd: dir,
      dryRun: true,
      signal: AbortSignal.abort(),
    });
    const plain = await translate({
      config: config({ targetLocales: ["de", "fr"] }),
      cwd: dir,
      dryRun: true,
      signal: new AbortController().signal,
    });

    expect(aborted).toMatchObject({ dryRun: true, cancelled: true, failed: ["de", "fr"] });
    expect("cancelled" in plain).toBe(false);
    expect(plain.succeeded).toEqual(["de", "fr"]);
    expect(await defaultFs.fileExists(runStatusFilePath(dir))).toBe(false);
  });

  it("claims no further locale under concurrency, releases every lock, and records the run", async () => {
    const dir = await project({ a: "Alpha" });
    const gated = gatedProvider();
    const controller = new AbortController();
    const targetLocales = ["de", "fr", "es", "it", "nl"];

    const running = translate(
      { config: config({ targetLocales }), cwd: dir, concurrency: 3, signal: controller.signal },
      { createProvider: () => gated.provider },
    );
    await gated.arrival(3);
    controller.abort();
    const summary = await running;

    expect(gated.requests.map((request) => request.targetLocale).sort()).toEqual([
      "de",
      "es",
      "fr",
    ]);
    expect(summary.cancelled).toBe(true);
    expect(summary.partial).toEqual(["de", "fr", "es"]);
    expect(summary.failed).toEqual(["it", "nl"]);
    expect(locale(summary, "it").error?.code).toBe("RUN_CANCELLED");
    expect(locale(summary, "de").providerFailures).toEqual([]);
    expect(await heldLocks(dir)).toEqual([]);
    expect(await defaultFs.fileExists(runStatusFilePath(dir))).toBe(true);
    expect(await defaultFs.fileExists(join(dir, "locales", "de.json"))).toBe(false);
  });

  it("stops waiting for a write lock another process holds", async () => {
    const dir = await project();
    const lockPath = localeLockPath(dir, "de");
    await mkdir(dirname(lockPath), { recursive: true });
    await writeFile(
      lockPath,
      JSON.stringify({ pid: 9999, acquiredAt: "2026-07-18T00:00:00.000Z" }),
    );
    const stub = makeStubProvider();
    const controller = new AbortController();

    const summary = await translate(
      {
        config: config(),
        cwd: dir,
        signal: controller.signal,
        onLockWait: () => controller.abort(),
      },
      { createProvider: () => stub.provider },
    );

    const de = locale(summary, "de");
    expect(summary.cancelled).toBe(true);
    expect(de.status).toBe("failed");
    expect(de.error).toMatchObject({
      code: "RUN_CANCELLED",
      message: expect.stringContaining("waiting for the write lock"),
    });
    expect(stub.calls).toHaveLength(0);
    expect(await defaultFs.fileExists(lockPath)).toBe(true);
    expect(await defaultFs.fileExists(lockFilePath(dir))).toBe(false);
  });
});

describe("retranslateEntry: cancelling", () => {
  it("abandons the provider request in flight, writes nothing, and releases the lock", async () => {
    const dir = await project();
    const gated = gatedProvider();
    const controller = new AbortController();

    const running = retranslateEntry(
      { config: config(), cwd: dir, locale: "de", key: "a", signal: controller.signal },
      { createProvider: () => gated.provider },
    );
    await gated.arrival(1);
    controller.abort();

    await expect(running).rejects.toMatchObject({ code: "RUN_CANCELLED" });
    expect(gated.requests[0]?.signal).toBe(controller.signal);
    expect(await defaultFs.fileExists(join(dir, "locales", "de.json"))).toBe(false);
    expect(await defaultFs.fileExists(lockFilePath(dir))).toBe(false);
    expect(await heldLocks(dir)).toEqual([]);
  });

  it("throws the provider's own failure when it arrives with the abort", async () => {
    const dir = await project();
    const controller = new AbortController();
    const provider: TranslationProvider = {
      id: "failing",
      kind: "llm",
      supportsGlossary: true,
      translateBatch: async () => {
        controller.abort();
        throw new ProviderError("RATE_LIMITED", "slow down");
      },
    };

    await expect(
      retranslateEntry(
        { config: config(), cwd: dir, locale: "de", key: "a", signal: controller.signal },
        { createProvider: () => provider },
      ),
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });

  it("calls no provider when the signal is already aborted", async () => {
    const dir = await project();
    const stub = makeStubProvider();

    await expect(
      retranslateEntry(
        { config: config(), cwd: dir, locale: "de", key: "a", signal: AbortSignal.abort() },
        { createProvider: () => stub.provider },
      ),
    ).rejects.toMatchObject({ code: "RUN_CANCELLED" });
    expect(stub.calls).toHaveLength(0);
  });

  it("writes the value when the signal is never aborted", async () => {
    const dir = await project();
    const stub = makeStubProvider();

    const result = await retranslateEntry(
      { config: config(), cwd: dir, locale: "de", key: "a", signal: new AbortController().signal },
      { createProvider: () => stub.provider },
    );

    expect(result).toMatchObject({ accepted: true, value: "[de] Alpha" });
  });
});
