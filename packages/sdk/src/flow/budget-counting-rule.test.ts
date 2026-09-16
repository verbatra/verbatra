import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type {
  TranslateRequest,
  TranslateResult,
  TranslationProvider,
  Usage,
} from "@verbatra/ai-providers";
import type { PlaceholderIntegrityResult, TranslationEntry } from "@verbatra/core";
import { describe, expect, it } from "vitest";
import type { VerbatraConfig } from "../config/schema.js";
import { baseConfig, makeTempDir, writeJsonFile } from "../test-support.js";
import {
  type BudgetTracker,
  createBudgetTracker,
  projectBatchTokens,
  reconcileBudget,
  reserveBudget,
  toBudgetSummary,
} from "./budget.js";
import type { PayloadContext } from "./estimate.js";
import { translate } from "./translate-project.js";

const CONTEXT: PayloadContext = { sourceLocale: "en", targetLocale: "de" };

function entry(key: string, value: string): TranslationEntry {
  return { key, namespace: "", value, placeholders: [], isPlural: false };
}

const BATCH: readonly TranslationEntry[] = [entry("k0", "hello there"), entry("k1", "goodbye")];

interface Step {
  readonly beforeReserve: number;
  readonly afterReserve: number;
  readonly afterReconcile: number;
}

function spendOnce(tracker: BudgetTracker, usage: Usage | undefined): Step {
  const beforeReserve = tracker.tokensUsed;
  const decision = reserveBudget(tracker, BATCH, CONTEXT);
  const afterReserve = tracker.tokensUsed;
  if (decision.reservation === undefined) {
    throw new Error("reservation refused; this suite only drives admitted requests");
  }
  reconcileBudget(tracker, decision.reservation, usage);
  return { beforeReserve, afterReserve, afterReconcile: tracker.tokensUsed };
}

function drive(usages: readonly (Usage | undefined)[]): {
  readonly tracker: BudgetTracker;
  readonly steps: readonly Step[];
} {
  const tracker = createBudgetTracker(10_000_000, "stop");
  const steps = usages.map((usage) => spendOnce(tracker, usage));
  return { tracker, steps };
}

function expectNonDecreasingAcrossRequests(steps: readonly Step[]): void {
  expect(steps.length).toBeGreaterThan(0);
  for (const step of steps) {
    expect(step.afterReconcile).toBeGreaterThanOrEqual(step.beforeReserve);
  }
}

const PROJECTION = projectBatchTokens(BATCH, CONTEXT);

describe("budget counting rule: a tiny positive figure on every call", () => {
  it("counts exactly what was reported and keeps the figure provider-reported", () => {
    const { tracker, steps } = drive([
      { inputTokens: 1, outputTokens: 0 },
      { inputTokens: 0, outputTokens: 1 },
      { inputTokens: 1, outputTokens: 1 },
    ]);

    expect(steps.map((step) => step.afterReconcile)).toEqual([1, 2, 4]);
    expectNonDecreasingAcrossRequests(steps);
    expect(toBudgetSummary(tracker)?.supported).toBe(true);
    expect(toBudgetSummary(tracker)?.tokensUsed).toBe(4);
  });

  it("charges the projection, not the report, while the request is in flight", () => {
    const { steps } = drive([{ inputTokens: 1, outputTokens: 0 }]);

    expect(steps[0]?.afterReserve).toBe(PROJECTION);
    expect(PROJECTION).toBeGreaterThan(1);
    expect(steps[0]?.afterReconcile).toBe(1);
  });
});

describe("budget counting rule: usage on some calls and none on others", () => {
  it("keeps the projection for the silent calls and marks the total estimated", () => {
    const { tracker, steps } = drive([
      { inputTokens: 60, outputTokens: 40 },
      undefined,
      { inputTokens: 10, outputTokens: 5 },
    ]);

    expect(steps.map((step) => step.afterReconcile)).toEqual([
      100,
      100 + PROJECTION,
      115 + PROJECTION,
    ]);
    expectNonDecreasingAcrossRequests(steps);
    const summary = toBudgetSummary(tracker);
    expect(summary?.supported).toBe(false);
    expect(summary?.tokensUsed).toBe(115 + PROJECTION);
  });

  it("treats an explicit zero exactly like a silent call, refunding nothing", () => {
    const { tracker, steps } = drive([{ inputTokens: 0, outputTokens: 0 }]);

    expect(steps[0]?.afterReconcile).toBe(PROJECTION);
    expect(tracker.usageSeen).toBe(false);
    expect(tracker.estimatedSeen).toBe(true);
    expect(toBudgetSummary(tracker)?.supported).toBe(false);
  });
});

describe("budget counting rule: opposite-signed input and output fields", () => {
  it("never lets a negative field cancel a positive one down to a smaller figure", () => {
    const { tracker, steps } = drive([{ inputTokens: 500, outputTokens: -100 }]);

    expect(steps[0]?.afterReconcile).toBe(500);
    expectNonDecreasingAcrossRequests(steps);
    expect(tracker.usageSeen).toBe(true);
    expect(toBudgetSummary(tracker)?.supported).toBe(true);
  });

  it("counts the positive field alone when the other one is reported negative", () => {
    const { tracker, steps } = drive([{ inputTokens: 100, outputTokens: -100 }]);

    expect(steps[0]?.afterReconcile).toBe(100);
    expect(tracker.usageSeen).toBe(true);
    expect(tracker.estimatedSeen).toBe(false);
  });

  it("falls back to the projection when every field is at or below zero", () => {
    const { tracker, steps } = drive([{ inputTokens: 0, outputTokens: -100 }]);

    expect(steps[0]?.afterReconcile).toBe(PROJECTION);
    expect(tracker.usageSeen).toBe(false);
    expect(tracker.estimatedSeen).toBe(true);
  });

  it("keeps a lone positive field rather than letting a large negative one bury it", () => {
    const { tracker, steps } = drive([{ inputTokens: 10, outputTokens: -5000 }]);

    expect(steps[0]?.afterReconcile).toBe(10);
    expect(steps[0]?.afterReconcile).toBeGreaterThan(0);
    expect(tracker.estimatedSeen).toBe(false);
  });

  it("never lets a run of negative reports drive the total backwards", () => {
    const { tracker, steps } = drive([
      { inputTokens: 900, outputTokens: 100 },
      { inputTokens: -10_000, outputTokens: 0 },
      { inputTokens: -10_000, outputTokens: 0 },
    ]);

    expectNonDecreasingAcrossRequests(steps);
    expect(steps.map((step) => step.afterReconcile)).toEqual([
      1000,
      1000 + PROJECTION,
      1000 + 2 * PROJECTION,
    ]);
    expect(tracker.tokensUsed).toBeGreaterThan(0);
  });
});

describe("budget counting rule: a non-integer report", () => {
  it("rounds a fractional report to a whole number the status file can persist", () => {
    const { tracker, steps } = drive([{ inputTokens: 1.5, outputTokens: 0.25 }]);

    expect(steps[0]?.afterReconcile).toBe(2);
    expect(Number.isInteger(tracker.tokensUsed)).toBe(true);
    expect(tracker.usageSeen).toBe(true);
    expect(toBudgetSummary(tracker)?.supported).toBe(true);
  });

  it("treats a fractional sum at or below zero as no report at all", () => {
    const { tracker, steps } = drive([{ inputTokens: 0.25, outputTokens: -0.25 }]);

    expect(steps[0]?.afterReconcile).toBe(PROJECTION);
    expect(tracker.estimatedSeen).toBe(true);
  });
});

async function project(source: Record<string, unknown>): Promise<string> {
  const dir = await makeTempDir();
  await mkdir(join(dir, "locales"));
  await writeJsonFile(join(dir, "locales", "en.json"), source);
  return dir;
}

const PASS: PlaceholderIntegrityResult = {
  matches: true,
  missing: [],
  extra: [],
  reordered: false,
};

function usageSequenceProvider(usages: readonly (Usage | undefined)[]): TranslationProvider {
  let call = 0;
  return {
    id: "sequenced",
    kind: "llm",
    supportsGlossary: true,
    translateBatch: (request: TranslateRequest): Promise<TranslateResult> => {
      const usage = usages[call];
      call += 1;
      const values = new Map<string, string>();
      const integrity = new Map<string, PlaceholderIntegrityResult>();
      for (const item of request.entries) {
        values.set(item.key, `[${request.targetLocale}] ${item.value}`);
        integrity.set(item.key, PASS);
      }
      return Promise.resolve(
        usage === undefined ? { values, integrity } : { values, integrity, usage },
      );
    },
  };
}

const cfg = (overrides: Partial<VerbatraConfig> = {}): VerbatraConfig =>
  baseConfig({ targetLocales: ["de"], maxTokens: 10_000_000, ...overrides });

describe("budget counting rule: the estimated marker on a whole run", () => {
  it("stays provider-reported when every request reported a positive figure", async () => {
    const dir = await project({ k0: "one", k1: "two", k2: "three", k3: "four" });

    const summary = await translate(
      { config: cfg({ maxBatchSize: 1 }), cwd: dir },
      {
        createProvider: () =>
          usageSequenceProvider([
            { inputTokens: 1, outputTokens: 0 },
            { inputTokens: 0, outputTokens: 1 },
            { inputTokens: 2, outputTokens: 2 },
            { inputTokens: 3, outputTokens: 1 },
          ]),
      },
    );

    expect(summary.budget?.supported).toBe(true);
    expect(summary.budget?.tokensUsed).toBe(10);
  });

  it("marks the run estimated as soon as one request reported zero", async () => {
    const dir = await project({ k0: "one", k1: "two" });

    const summary = await translate(
      { config: cfg({ maxBatchSize: 1 }), cwd: dir },
      {
        createProvider: () =>
          usageSequenceProvider([
            { inputTokens: 5, outputTokens: 5 },
            { inputTokens: 0, outputTokens: 0 },
          ]),
      },
    );

    expect(summary.budget?.supported).toBe(false);
    expect(summary.budget?.tokensUsed).toBeGreaterThan(10);
  });

  it("marks the run estimated when the provider reports no usage at all", async () => {
    const dir = await project({ k0: "one", k1: "two" });

    const summary = await translate(
      { config: cfg({ maxBatchSize: 1 }), cwd: dir },
      { createProvider: () => usageSequenceProvider([undefined, undefined]) },
    );

    expect(summary.budget?.supported).toBe(false);
    expect(summary.budget?.tokensUsed).toBeGreaterThan(0);
  });

  it("leaves a run that sent nothing at zero and not provider-reported", async () => {
    const dir = await project({});

    const summary = await translate(
      { config: cfg(), cwd: dir },
      { createProvider: () => usageSequenceProvider([]) },
    );

    expect(summary.budget?.tokensUsed).toBe(0);
    expect(summary.budget?.supported).toBe(false);
    expect(summary.budget?.exceeded).toBe(false);
  });
});
