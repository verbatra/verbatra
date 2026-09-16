import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import {
  ProviderError,
  type TranslateRequest,
  type TranslateResult,
  type TranslationProvider,
  type Usage,
} from "@verbatra/ai-providers";
import type { PlaceholderIntegrityResult } from "@verbatra/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VerbatraConfig } from "../config/schema.js";
import { SdkError } from "../errors.js";
import { baseConfig, makeTempDir, writeJsonFile } from "../test-support.js";
import type { BudgetTracker } from "./budget.js";
import { translate } from "./translate-project.js";

interface ReserveEvent {
  readonly type: "reserve";
  readonly granted: boolean;
  readonly batchSize: number;
  readonly projected: number | undefined;
  readonly totalAfter: number;
}

interface CallEvent {
  readonly type: "call";
  readonly locale: string;
  readonly batchSize: number;
  readonly totalAtEntry: number;
}

type ProbeEvent = ReserveEvent | CallEvent;

const probe = vi.hoisted(() => ({
  tracker: undefined as BudgetTracker | undefined,
  log: [] as ProbeEvent[],
}));

vi.mock("./budget.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./budget.js")>();
  const createBudgetTracker: typeof actual.createBudgetTracker = (maxTokens, behavior) => {
    const tracker = actual.createBudgetTracker(maxTokens, behavior);
    probe.tracker = tracker;
    return tracker;
  };
  const reserveBudget: typeof actual.reserveBudget = (tracker, entries, context) => {
    const decision = actual.reserveBudget(tracker, entries, context);
    probe.log.push({
      type: "reserve",
      granted: decision.reservation !== undefined,
      batchSize: entries.length,
      projected: decision.reservation?.projected ?? decision.refusedProjection,
      totalAfter: tracker.tokensUsed,
    });
    return decision;
  };
  return { ...actual, createBudgetTracker, reserveBudget };
});

const PASS: PlaceholderIntegrityResult = {
  matches: true,
  missing: [],
  extra: [],
  reordered: false,
};

function respond(request: TranslateRequest, usage: Usage | undefined): TranslateResult {
  const values = new Map<string, string>();
  const integrity = new Map<string, PlaceholderIntegrityResult>();
  for (const entry of request.entries) {
    values.set(entry.key, `[${request.targetLocale}] ${entry.value}`);
    integrity.set(entry.key, PASS);
  }
  return usage === undefined ? { values, integrity } : { values, integrity, usage };
}

type Behave = (request: TranslateRequest, call: number) => TranslateResult | Error;

function makeRecordingProvider(behave: Behave): TranslationProvider {
  let call = 0;
  return {
    id: "recording",
    kind: "llm",
    supportsGlossary: true,
    translateBatch: (request: TranslateRequest): Promise<TranslateResult> => {
      call += 1;
      probe.log.push({
        type: "call",
        locale: request.targetLocale,
        batchSize: request.entries.length,
        totalAtEntry: probe.tracker?.tokensUsed ?? Number.NaN,
      });
      const outcome = behave(request, call);
      return outcome instanceof Error ? Promise.reject(outcome) : Promise.resolve(outcome);
    },
  };
}

const USAGE_100: Usage = { inputTokens: 60, outputTokens: 40 };

const alwaysUsage: Behave = (request) => respond(request, USAGE_100);

function calls(): readonly CallEvent[] {
  return probe.log.filter((event): event is CallEvent => event.type === "call");
}

function reserves(): readonly ReserveEvent[] {
  return probe.log.filter((event): event is ReserveEvent => event.type === "reserve");
}

function expectEveryCallReserved(): void {
  expect(calls().length).toBeGreaterThan(0);
  let granted = 0;
  let started = 0;
  for (const event of probe.log) {
    if (event.type === "reserve") {
      granted += event.granted ? 1 : 0;
    } else {
      started += 1;
      expect(granted).toBeGreaterThanOrEqual(started);
    }
  }
  expect(granted).toBe(started);
}

function expectReservationImmediatelyPrecedesEveryCall(): void {
  probe.log.forEach((event, index) => {
    if (event.type !== "call") {
      return;
    }
    const previous = probe.log[index - 1];
    expect(previous?.type).toBe("reserve");
    expect(previous?.type === "reserve" && previous.granted).toBe(true);
  });
}

function expectCeilingHeldAtEveryCall(maxTokens: number): void {
  for (const call of calls()) {
    expect(call.totalAtEntry).toBeLessThanOrEqual(maxTokens);
  }
}

function expectNoCallAfterFirstRefusal(): ReserveEvent {
  const index = probe.log.findIndex((event) => event.type === "reserve" && !event.granted);
  expect(index).toBeGreaterThanOrEqual(0);
  const refusal = probe.log[index];
  expect(refusal?.type).toBe("reserve");
  expect(probe.log.slice(index).some((event) => event.type === "call")).toBe(false);
  return refusal as ReserveEvent;
}

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

function keyedSource(count: number): Record<string, string> {
  const source: Record<string, string> = {};
  for (let index = 0; index < count; index += 1) {
    source[`k${index}`] = `value number ${index}`;
  }
  return source;
}

const cfg = (overrides: Partial<VerbatraConfig> = {}): VerbatraConfig =>
  baseConfig({ targetLocales: ["de"], ...overrides });

beforeEach(() => {
  probe.log.length = 0;
  probe.tracker = undefined;
});

describe("spend guarantee: plain translation", () => {
  it("reserves before every request and never enters one above the ceiling", async () => {
    const dir = await project(keyedSource(6), { de: undefined, fr: undefined });

    const summary = await translate(
      {
        config: cfg({
          targetLocales: ["de", "fr"],
          maxBatchSize: 2,
          maxTokens: 100_000,
          budgetBehavior: "stop",
        }),
        cwd: dir,
      },
      { createProvider: () => makeRecordingProvider(alwaysUsage) },
    );

    expect(calls()).toHaveLength(6);
    expectEveryCallReserved();
    expectReservationImmediatelyPrecedesEveryCall();
    expectCeilingHeldAtEveryCall(100_000);
    expect(summary.locales.flatMap((locale) => locale.budgetWithheld)).toEqual([]);
  });

  it("holds the ceiling at call entry when the run is stopped part-way through", async () => {
    const dir = await project(keyedSource(6), { de: undefined, fr: undefined });

    const summary = await translate(
      {
        config: cfg({
          targetLocales: ["de", "fr"],
          maxBatchSize: 2,
          maxTokens: 500,
          budgetBehavior: "stop",
        }),
        cwd: dir,
      },
      { createProvider: () => makeRecordingProvider(alwaysUsage) },
    );

    expectEveryCallReserved();
    expectCeilingHeldAtEveryCall(500);
    expect(summary.budget?.tokensUsed).toBeLessThanOrEqual(500);
    expect(summary.budget?.exceeded).toBe(true);
    expect(reserves().some((reserve) => !reserve.granted)).toBe(true);
  });
});

const PLURAL_SOURCE = { items_one: "{{count}} item", items_other: "{{count}} items" };

interface PluralRun {
  readonly summary: Awaited<ReturnType<typeof translate>>;
  readonly reserved: readonly number[];
}

async function runPluralRun(ceiling: number, behavior: "warn" | "stop"): Promise<PluralRun> {
  const dir = await project(PLURAL_SOURCE, { pl: {} });
  const summary = await translate(
    {
      config: cfg({ targetLocales: ["pl"], maxTokens: ceiling, budgetBehavior: behavior }),
      cwd: dir,
      generatePlurals: true,
    },
    { createProvider: () => makeRecordingProvider(alwaysUsage) },
  );
  return {
    summary,
    reserved: reserves()
      .filter((reserve) => reserve.granted)
      .map((reserve) => reserve.projected ?? 0),
  };
}

describe("spend guarantee: plural generation", () => {
  it("reserves before every generation request too", async () => {
    const dir = await project(PLURAL_SOURCE, { pl: {} });

    const summary = await translate(
      {
        config: cfg({ targetLocales: ["pl"], maxTokens: 100_000, budgetBehavior: "stop" }),
        cwd: dir,
        generatePlurals: true,
      },
      { createProvider: () => makeRecordingProvider(alwaysUsage) },
    );

    expect(summary.locales[0]?.generated).toEqual(["items_few", "items_many"]);
    expect(calls().length).toBeGreaterThanOrEqual(2);
    expectEveryCallReserved();
    expectReservationImmediatelyPrecedesEveryCall();
    expectCeilingHeldAtEveryCall(100_000);
  });

  it("withholds a generation batch that would cross, without sending it", async () => {
    const calibration = await runPluralRun(10_000_000, "warn");
    expect(calibration.reserved).toHaveLength(2);
    const ceiling = calibration.reserved[0] ?? 0;
    probe.log.length = 0;

    const summary = await runPluralRun(ceiling, "stop");

    expect(calls()).toHaveLength(1);
    const refusal = expectNoCallAfterFirstRefusal();
    expect(refusal.batchSize).toBe(2);
    expectEveryCallReserved();
    expectCeilingHeldAtEveryCall(ceiling);
    expect(summary.summary.locales[0]?.budgetWithheld).toEqual(["items_few", "items_many"]);
    expect(summary.summary.locales[0]?.translated).toEqual(["items_one", "items_other"]);
  });
});

const TRUNCATED = (): Error => new ProviderError("OUTPUT_TRUNCATED", "output was cut off");

describe("spend guarantee: truncation re-split", () => {
  it("reserves separately for every half at every level of the recursion", async () => {
    const dir = await project(keyedSource(8), { de: undefined });

    await translate(
      {
        config: cfg({ maxBatchSize: 8, maxTokens: 10_000_000, budgetBehavior: "warn" }),
        cwd: dir,
      },
      { createProvider: () => makeRecordingProvider(() => TRUNCATED()) },
    );

    expect(calls().map((call) => call.batchSize)).toEqual([
      8, 4, 2, 1, 1, 2, 1, 1, 4, 2, 1, 1, 2, 1, 1,
    ]);
    expectEveryCallReserved();
    expectReservationImmediatelyPrecedesEveryCall();
    expectCeilingHeldAtEveryCall(10_000_000);
  });

  it("charges the whole projection of a truncated request rather than refunding it", async () => {
    const dir = await project(keyedSource(8), { de: undefined });

    const summary = await translate(
      {
        config: cfg({ maxBatchSize: 8, maxTokens: 10_000_000, budgetBehavior: "warn" }),
        cwd: dir,
      },
      { createProvider: () => makeRecordingProvider(() => TRUNCATED()) },
    );

    const projected = reserves()
      .filter((reserve) => reserve.granted)
      .reduce((total, reserve) => total + (reserve.projected ?? 0), 0);
    expect(projected).toBeGreaterThan(0);
    expect(summary.budget?.tokensUsed).toBe(projected);
    expect(summary.budget?.supported).toBe(false);
  });
});

async function projectionsForDeepSplit(): Promise<readonly number[]> {
  const dir = await project(keyedSource(8), { de: undefined });
  await translate(
    {
      config: cfg({ maxBatchSize: 8, maxTokens: 10_000_000, budgetBehavior: "warn" }),
      cwd: dir,
    },
    { createProvider: () => makeRecordingProvider(() => TRUNCATED()) },
  );
  return reserves().map((reserve) => reserve.projected ?? 0);
}

async function runDeepSplitUnder(ceiling: number): Promise<void> {
  const dir = await project(keyedSource(8), { de: undefined });
  await translate(
    { config: cfg({ maxBatchSize: 8, maxTokens: ceiling, budgetBehavior: "stop" }), cwd: dir },
    { createProvider: () => makeRecordingProvider(() => TRUNCATED()) },
  );
}

describe("spend guarantee: deep truncation recursion stops where the ceiling is reached", () => {
  it("refuses at level two and sends nothing further, with the top level already admitted", async () => {
    const projections = await projectionsForDeepSplit();
    expect(projections.length).toBe(15);
    const ceiling = (projections[0] ?? 0) + (projections[1] ?? 0);
    probe.log.length = 0;

    await runDeepSplitUnder(ceiling);

    expect(calls().map((call) => call.batchSize)).toEqual([8, 4]);
    const refusal = expectNoCallAfterFirstRefusal();
    expect(refusal.batchSize).toBe(2);
    expectCeilingHeldAtEveryCall(ceiling);
    expectEveryCallReserved();
  });

  it("refuses at level three and sends nothing further, with levels one and two admitted", async () => {
    const projections = await projectionsForDeepSplit();
    const ceiling = (projections[0] ?? 0) + (projections[1] ?? 0) + (projections[2] ?? 0);
    probe.log.length = 0;

    await runDeepSplitUnder(ceiling);

    expect(calls().map((call) => call.batchSize)).toEqual([8, 4, 2]);
    const refusal = expectNoCallAfterFirstRefusal();
    expect(refusal.batchSize).toBe(1);
    expectCeilingHeldAtEveryCall(ceiling);
    expectEveryCallReserved();
  });

  it("refuses at level one when even the first request would cross", async () => {
    const projections = await projectionsForDeepSplit();
    const ceiling = (projections[0] ?? 0) - 1;
    probe.log.length = 0;

    await runDeepSplitUnder(ceiling);

    expect(calls()).toEqual([]);
    const refusal = expectNoCallAfterFirstRefusal();
    expect(refusal.batchSize).toBe(8);
  });
});

describe("spend guarantee: a re-split half that crosses the ceiling", () => {
  it("reports the ceiling as reached before the second half, not as a refused projection", async () => {
    const calibration = await project(keyedSource(2), { de: undefined });
    await translate(
      {
        config: cfg({ maxBatchSize: 2, maxTokens: 10_000_000, budgetBehavior: "warn" }),
        cwd: calibration,
      },
      { createProvider: () => makeRecordingProvider(() => TRUNCATED()) },
    );
    const [whole = 0, firstHalf = 0] = reserves().map((reserve) => reserve.projected ?? 0);
    const ceiling = whole + firstHalf + 10;
    probe.log.length = 0;
    const dir = await project(keyedSource(2), { de: undefined });
    const firstHalfOvershoots: Behave = (request, call) =>
      call === 1 ? TRUNCATED() : respond(request, { inputTokens: 4000, outputTokens: 1000 });

    const summary = await translate(
      { config: cfg({ maxBatchSize: 2, maxTokens: ceiling, budgetBehavior: "stop" }), cwd: dir },
      { createProvider: () => makeRecordingProvider(firstHalfOvershoots) },
    );

    const counted = whole + 5000;
    const locale = summary.locales[0];
    expect(calls().map((call) => call.batchSize)).toEqual([2, 1]);
    expect(locale?.budgetWithheld).toEqual(["k1"]);
    expect(summary.budget?.tokensUsed).toBe(counted);
    expect(
      locale?.notices
        .filter((notice) => notice.code === "BUDGET_TOKENS_EXCEEDED")
        .map((notice) => notice.message),
    ).toEqual([
      `The run's cumulative token usage (${counted}) reached the configured budget of ${ceiling} ` +
        "tokens (behavior: stop).",
    ]);
  });
});

describe("spend guarantee: a locale that fails part-way, then a later locale", () => {
  it("keeps every later request reserved and under the ceiling", async () => {
    const dir = await project(keyedSource(6), { de: undefined, fr: undefined });
    const behave: Behave = (request, call) =>
      request.targetLocale === "de" && call === 2 ? new Error("boom") : respond(request, USAGE_100);

    const summary = await translate(
      {
        config: cfg({
          targetLocales: ["de", "fr"],
          maxBatchSize: 2,
          maxTokens: 100_000,
          budgetBehavior: "stop",
        }),
        cwd: dir,
      },
      { createProvider: () => makeRecordingProvider(behave) },
    );

    expect(summary.locales.find((locale) => locale.locale === "de")?.status).toBe("partial");
    expect(summary.locales.find((locale) => locale.locale === "fr")?.status).toBe("succeeded");
    expect(calls().filter((call) => call.locale === "fr")).toHaveLength(3);
    expectEveryCallReserved();
    expectReservationImmediatelyPrecedesEveryCall();
    expectCeilingHeldAtEveryCall(100_000);
  });
});

describe("spend guarantee: a cache-heavy run", () => {
  it("reserves only for the keys the cache could not serve", async () => {
    const dir = await project(keyedSource(4), { de: undefined });
    const budgeted = cfg({ maxBatchSize: 1, maxTokens: 100_000, budgetBehavior: "stop" });

    await translate(
      { config: budgeted, cwd: dir },
      { createProvider: () => makeRecordingProvider(alwaysUsage) },
    );
    expect(calls()).toHaveLength(4);

    await rm(join(dir, "locales", "de.json"));
    await writeJsonFile(join(dir, "locales", "en.json"), {
      ...keyedSource(4),
      k4: "a brand new value",
    });
    probe.log.length = 0;

    const summary = await translate(
      { config: budgeted, cwd: dir },
      { createProvider: () => makeRecordingProvider(alwaysUsage) },
    );

    expect(summary.locales[0]?.cacheHits).toEqual(["k0", "k1", "k2", "k3"]);
    expect(calls()).toHaveLength(1);
    expect(calls()[0]?.batchSize).toBe(1);
    expect(reserves()).toHaveLength(1);
    expectEveryCallReserved();
    expectCeilingHeldAtEveryCall(100_000);
  });

  it("sends nothing and reserves nothing when the cache serves every key", async () => {
    const dir = await project(keyedSource(4), { de: undefined });
    const budgeted = cfg({ maxTokens: 100_000, budgetBehavior: "stop" });

    await translate(
      { config: budgeted, cwd: dir },
      { createProvider: () => makeRecordingProvider(alwaysUsage) },
    );
    await rm(join(dir, "locales", "de.json"));
    probe.log.length = 0;

    const summary = await translate(
      { config: budgeted, cwd: dir },
      { createProvider: () => makeRecordingProvider(alwaysUsage) },
    );

    expect(summary.locales[0]?.cacheHits).toEqual(["k0", "k1", "k2", "k3"]);
    expect(probe.log).toEqual([]);
    expect(summary.budget?.tokensUsed).toBe(0);
  });
});

describe("spend guarantee: an admitted request that bills above its projection", () => {
  it("absorbs the overshoot at reconciliation and admits nothing further", async () => {
    const dir = await project(keyedSource(6), { de: undefined });
    const overshoot: Behave = (request, call) =>
      call === 1
        ? respond(request, { inputTokens: 5000, outputTokens: 5000 })
        : respond(request, USAGE_100);

    const summary = await translate(
      {
        config: cfg({ maxBatchSize: 1, maxTokens: 1000, budgetBehavior: "stop" }),
        cwd: dir,
      },
      { createProvider: () => makeRecordingProvider(overshoot) },
    );

    expect(calls()).toHaveLength(1);
    expect(summary.budget?.tokensUsed).toBe(10_000);
    expect(summary.budget?.exceeded).toBe(true);
    expect(summary.locales[0]?.budgetWithheld).toEqual(["k1", "k2", "k3", "k4", "k5"]);
    expectNoCallAfterFirstRefusal();
  });

  it("leaves the ceiling crossed only by the request that was already admitted", async () => {
    const dir = await project(keyedSource(6), { de: undefined, fr: undefined });
    const overshoot: Behave = (request, call) =>
      call === 1
        ? respond(request, { inputTokens: 5000, outputTokens: 5000 })
        : respond(request, USAGE_100);

    const summary = await translate(
      {
        config: cfg({
          targetLocales: ["de", "fr"],
          maxBatchSize: 1,
          maxTokens: 1000,
          budgetBehavior: "stop",
        }),
        cwd: dir,
      },
      { createProvider: () => makeRecordingProvider(overshoot) },
    );

    expect(calls()).toHaveLength(1);
    expect(calls()[0]?.totalAtEntry).toBeLessThanOrEqual(1000);
    expect(summary.locales.find((locale) => locale.locale === "fr")?.status).toBe("failed");
  });
});

describe("spend guarantee: concurrency above one", () => {
  it("refuses a live budgeted run before any provider request is sent", async () => {
    const dir = await project(keyedSource(4), { de: undefined, fr: undefined });

    await expect(
      translate(
        {
          config: cfg({ targetLocales: ["de", "fr"], maxTokens: 100_000, budgetBehavior: "stop" }),
          cwd: dir,
          concurrency: 2,
        },
        { createProvider: () => makeRecordingProvider(alwaysUsage) },
      ),
    ).rejects.toThrow(SdkError);
    expect(probe.log).toEqual([]);
  });

  it("names the conflict code so a caller can tell it from any other refusal", async () => {
    const dir = await project(keyedSource(4), { de: undefined, fr: undefined });

    const error = await translate(
      {
        config: cfg({ targetLocales: ["de", "fr"], maxTokens: 1, budgetBehavior: "warn" }),
        cwd: dir,
        concurrency: 2,
      },
      { createProvider: () => makeRecordingProvider(alwaysUsage) },
    ).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(SdkError);
    expect((error as SdkError).code).toBe("CONCURRENCY_BUDGET_CONFLICT");
  });

  it("still reserves before every request when concurrency runs without a budget", async () => {
    const dir = await project(keyedSource(4), { de: undefined, fr: undefined });

    await translate(
      { config: cfg({ targetLocales: ["de", "fr"], maxBatchSize: 2 }), cwd: dir, concurrency: 2 },
      { createProvider: () => makeRecordingProvider(alwaysUsage) },
    );

    expect(calls()).toHaveLength(4);
    expectEveryCallReserved();
    expect(probe.tracker?.maxTokens).toBeUndefined();
  });

  it("exempts a dry run, which sends nothing at all", async () => {
    const dir = await project(keyedSource(4), { de: undefined, fr: undefined });

    const summary = await translate(
      {
        config: cfg({ targetLocales: ["de", "fr"], maxTokens: 100_000, budgetBehavior: "stop" }),
        cwd: dir,
        dryRun: true,
        concurrency: 2,
      },
      { createProvider: () => makeRecordingProvider(alwaysUsage) },
    );

    expect(calls()).toEqual([]);
    expect(summary.locales).toHaveLength(2);
  });
});
