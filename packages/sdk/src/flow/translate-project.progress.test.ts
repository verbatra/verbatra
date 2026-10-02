import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { localeLockPath } from "../lock/locale-write-lock.js";
import type { ProgressEvent } from "../progress/types.js";
import { baseConfig, makeStubProvider, makeTempDir, writeJsonFile } from "../test-support.js";
import type { LocaleSummary } from "./summary.js";
import { translate } from "./translate-project.js";

const BASE_TYPES: ReadonlySet<string> = new Set([
  "locale-started",
  "sub-batch",
  "locale-finished",
  "run-finished",
]);

async function holdLock(dir: string, locale: string): Promise<void> {
  const path = localeLockPath(dir, locale);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(
    path,
    JSON.stringify({ pid: 9999, acquiredAt: "2026-07-18T00:00:00.000Z" }),
    "utf8",
  );
}

function localeSummary(summaries: readonly LocaleSummary[], locale: string): LocaleSummary {
  const summary = summaries.find((entry) => entry.locale === locale);
  if (summary === undefined) {
    throw new Error(`no summary for locale ${locale}`);
  }
  return summary;
}

async function makeProject(keyCount: number): Promise<string> {
  const dir = await makeTempDir();
  await mkdir(join(dir, "locales"));
  const source: Record<string, string> = {};
  for (let index = 0; index < keyCount; index += 1) {
    source[`k${index}`] = `value ${index}`;
  }
  await writeJsonFile(join(dir, "locales", "en.json"), source);
  return dir;
}

describe("translate: onProgress emits locale, sub-batch, and run events on the live path", () => {
  it("fires a started/finished event per locale, a sub-batch per batch, and one run-finished", async () => {
    const dir = await makeProject(3);
    const config = baseConfig({ targetLocales: ["de", "fr"], maxBatchSize: 2 });
    const { provider } = makeStubProvider();
    const events: ProgressEvent[] = [];

    await translate(
      { config, cwd: dir, onProgress: (event) => events.push(event) },
      { createProvider: () => provider },
    );

    expect(events.filter((event) => BASE_TYPES.has(event.type))).toEqual([
      { type: "locale-started", locale: "de", localeIndex: 0, totalLocales: 2 },
      { type: "sub-batch", locale: "de", batchIndex: 1, totalBatches: 2 },
      { type: "sub-batch", locale: "de", batchIndex: 2, totalBatches: 2 },
      { type: "locale-finished", locale: "de", translated: 3, localeIndex: 0, totalLocales: 2 },
      { type: "locale-started", locale: "fr", localeIndex: 1, totalLocales: 2 },
      { type: "sub-batch", locale: "fr", batchIndex: 1, totalBatches: 2 },
      { type: "sub-batch", locale: "fr", batchIndex: 2, totalBatches: 2 },
      { type: "locale-finished", locale: "fr", translated: 3, localeIndex: 1, totalLocales: 2 },
      { type: "run-finished", localesCompleted: 2 },
    ]);
  });

  it("plans, times each batch with its usage, and announces the write, in order", async () => {
    const dir = await makeProject(3);
    const config = baseConfig({ targetLocales: ["de"], maxBatchSize: 2 });
    const { provider } = makeStubProvider({ usage: { inputTokens: 10, outputTokens: 4 } });
    const events: ProgressEvent[] = [];

    await translate(
      { config, cwd: dir, onProgress: (event) => events.push(event) },
      { createProvider: () => provider },
    );

    const batchFinished = {
      type: "batch-finished",
      locale: "de",
      totalBatches: 2,
      durationMs: expect.any(Number),
      usage: { inputTokens: 10, outputTokens: 4 },
    };
    expect(events).toEqual([
      { type: "locale-started", locale: "de", localeIndex: 0, totalLocales: 1 },
      { type: "locale-planned", locale: "de", keys: 3, batches: 2, cacheHits: 0 },
      { type: "sub-batch", locale: "de", batchIndex: 1, totalBatches: 2 },
      { ...batchFinished, batchIndex: 1 },
      { type: "sub-batch", locale: "de", batchIndex: 2, totalBatches: 2 },
      { ...batchFinished, batchIndex: 2 },
      { type: "writing", locale: "de" },
      { type: "locale-finished", locale: "de", translated: 3, localeIndex: 0, totalLocales: 1 },
      { type: "run-finished", localesCompleted: 1 },
    ]);
  });

  it("counts translation-memory hits in the plan and leaves usage off a batch that reported none", async () => {
    const dir = await makeProject(2);
    const config = baseConfig({ targetLocales: ["de"] });
    const { provider } = makeStubProvider();
    await translate({ config, cwd: dir }, { createProvider: () => provider });
    await writeJsonFile(join(dir, "locales", "en.json"), {
      k0: "value 0",
      k1: "value 1",
      k2: "new",
    });
    await writeJsonFile(join(dir, "locales", "de.json"), {});
    const events: ProgressEvent[] = [];

    await translate(
      { config, cwd: dir, onProgress: (event) => events.push(event) },
      { createProvider: () => provider },
    );

    expect(events).toContainEqual({
      type: "locale-planned",
      locale: "de",
      keys: 1,
      batches: 1,
      cacheHits: 2,
    });
    const finished = events.find((event) => event.type === "batch-finished");
    expect(finished).not.toHaveProperty("usage");
  });

  it("reports a provider retry the provider makes, through the hooks the SDK hands its factory", async () => {
    const dir = await makeProject(1);
    const config = baseConfig({ targetLocales: ["de"] });
    const { provider } = makeStubProvider();
    const events: ProgressEvent[] = [];

    await translate(
      { config, cwd: dir, onProgress: (event) => events.push(event) },
      {
        createProvider: (_config, _context, hooks) => {
          hooks?.onRetry?.({ attempt: 2, delayMs: 250, status: 429 });
          return provider;
        },
      },
    );

    expect(events).toContainEqual({
      type: "provider-retry",
      attempt: 2,
      delayMs: 250,
      status: 429,
    });
  });

  it("hands the factory no hooks when nobody listens to progress", async () => {
    const dir = await makeProject(1);
    const config = baseConfig({ targetLocales: ["de"] });
    const { provider } = makeStubProvider();
    const createProvider = vi.fn(() => provider);

    await translate({ config, cwd: dir }, { createProvider });

    expect(createProvider).toHaveBeenCalledWith(config.provider);
  });

  it("reports the repair round a provider runs for keys its first response left out", async () => {
    const dir = await makeProject(2);
    const config = baseConfig({ targetLocales: ["de"] });
    const { provider } = makeStubProvider();
    const events: ProgressEvent[] = [];

    await translate(
      { config, cwd: dir, onProgress: (event) => events.push(event) },
      {
        createProvider: () => ({
          ...provider,
          translateBatch: async (request) => {
            request.onRepair?.(1);
            return provider.translateBatch(request);
          },
        }),
      },
    );

    expect(events).toContainEqual({ type: "repair", locale: "de", keys: 1 });
  });

  it("emits no plan, batch or write event on a dry run", async () => {
    const dir = await makeProject(3);
    const config = baseConfig({ targetLocales: ["de"] });
    const events: ProgressEvent[] = [];

    await translate({ config, cwd: dir, dryRun: true, onProgress: (event) => events.push(event) });

    expect(events.map((event) => event.type)).toEqual([
      "locale-started",
      "locale-finished",
      "run-finished",
    ]);
  });

  it("does not construct a provider or emit a sub-batch event on a dry-run", async () => {
    const dir = await makeProject(3);
    const config = baseConfig({ targetLocales: ["de"], maxBatchSize: 2 });
    const createProvider = vi.fn(() => makeStubProvider().provider);
    const events: ProgressEvent[] = [];

    await translate(
      { config, cwd: dir, dryRun: true, onProgress: (event) => events.push(event) },
      { createProvider },
    );

    expect(createProvider).not.toHaveBeenCalled();
    expect(events.some((event) => event.type === "sub-batch")).toBe(false);
    expect(events).toEqual([
      { type: "locale-started", locale: "de", localeIndex: 0, totalLocales: 1 },
      { type: "locale-finished", locale: "de", translated: 3, localeIndex: 0, totalLocales: 1 },
      { type: "run-finished", localesCompleted: 1 },
    ]);
  });

  it("counts a failed (isolated, not thrown) locale in run-finished and fires its locale-finished with 0", async () => {
    const dir = await makeProject(1);
    await holdLock(dir, "de");
    const config = baseConfig({ targetLocales: ["de", "fr"] });
    const { provider } = makeStubProvider();
    const events: ProgressEvent[] = [];

    const summary = await translate(
      { config, cwd: dir, lockAcquireTimeoutMs: 20, onProgress: (event) => events.push(event) },
      { createProvider: () => provider },
    );

    expect(localeSummary(summary.locales, "de").status).toBe("failed");
    expect(events).toContainEqual({
      type: "locale-finished",
      locale: "de",
      translated: 0,
      localeIndex: 0,
      totalLocales: 2,
    });
    expect(events).toContainEqual({ type: "run-finished", localesCompleted: 2 });
  });

  it("carries the same localeIndex on a finish as on its start, even out of completion order", async () => {
    const dir = await makeProject(1);
    const config = baseConfig({ targetLocales: ["de", "fr", "es"] });
    const { provider } = makeStubProvider();
    const events: ProgressEvent[] = [];

    await translate(
      { config, cwd: dir, concurrency: 3, onProgress: (event) => events.push(event) },
      { createProvider: () => provider },
    );

    const started = new Map(
      events
        .filter((event) => event.type === "locale-started")
        .map((event) => [event.locale, event.localeIndex]),
    );
    const finished = events.filter((event) => event.type === "locale-finished");

    expect(finished).toHaveLength(3);
    for (const event of finished) {
      expect(event.localeIndex).toBe(started.get(event.locale));
      expect(event.totalLocales).toBe(3);
    }
  });

  it("runs with no onProgress listener without error", async () => {
    const dir = await makeProject(1);
    const config = baseConfig({ targetLocales: ["de"] });
    const { provider } = makeStubProvider();

    const summary = await translate({ config, cwd: dir }, { createProvider: () => provider });

    expect(summary.succeeded).toEqual(["de"]);
  });
});
