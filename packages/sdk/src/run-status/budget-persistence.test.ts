import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { LocaleSummary, NeedsReviewEntry, RunBudget, RunSummary } from "../flow/summary.js";
import { defaultFs } from "../fs.js";
import { makeTempDir } from "../test-support.js";
import { buildRunStatusFile, readRunStatusFile, writeRunStatusFile } from "./run-status-file.js";
import type { RunStatusFile } from "./types.js";

function succeededLocale(): LocaleSummary {
  return {
    locale: "de",
    status: "succeeded",
    translated: [],
    unchanged: [],
    orphaned: [],
    pruned: [],
    invalidIcuSource: [],
    cacheHits: [],
    fuzzyHits: [],
    integrityMismatches: [],
    providerFailures: [],
    generated: [],
    budgetWithheld: [],
    notices: [],
    needsReview: [],
    unfilled: [],
    malformedRows: [],
    duplicateKeys: [],
  };
}

function runSummary(budget: RunBudget): RunSummary {
  return {
    dryRun: false,
    locales: [succeededLocale()],
    succeeded: ["de"],
    partial: [],
    failed: [],
    budget,
  };
}

async function roundTrip(budget: RunBudget): Promise<RunBudget | undefined> {
  const dir = await makeTempDir();
  const path = join(dir, ".verbatra-local", "run-status.json");
  await writeRunStatusFile(path, buildRunStatusFile(runSummary(budget)), defaultFs);
  const read = await readRunStatusFile(path, defaultFs);
  return read?.budget;
}

describe("run-status persistence: a budget round-trips whether its count was reported or estimated", () => {
  it("carries consumption and the ceiling state for an estimated budget", async () => {
    const budget: RunBudget = {
      maxTokens: 800,
      behavior: "stop",
      supported: false,
      tokensUsed: 794,
      exceeded: true,
    };

    expect(await roundTrip(budget)).toEqual(budget);
  });

  it("carries a provider-reported budget unchanged", async () => {
    const budget: RunBudget = {
      maxTokens: 800,
      behavior: "warn",
      supported: true,
      tokensUsed: 120,
      exceeded: false,
    };

    expect(await roundTrip(budget)).toEqual(budget);
  });

  it("persists a run that counted nothing as zero rather than dropping the budget", async () => {
    const budget: RunBudget = {
      maxTokens: 500,
      behavior: "warn",
      supported: false,
      tokensUsed: 0,
      exceeded: false,
    };

    const read = await roundTrip(budget);
    expect(read).toEqual(budget);
    expect(read?.tokensUsed).toBe(0);
  });

  it("reads a status file edited to hold a fractional counted total as unavailable, never as a fraction", async () => {
    const dir = await makeTempDir();
    const path = join(dir, ".verbatra-local", "run-status.json");
    const budget: RunBudget = {
      maxTokens: 800,
      behavior: "stop",
      supported: true,
      tokensUsed: 2,
      exceeded: false,
    };
    await writeRunStatusFile(path, buildRunStatusFile(runSummary(budget)), defaultFs);
    const onDisk = JSON.parse(await readFile(path, "utf8")) as { budget: { tokensUsed: number } };
    onDisk.budget.tokensUsed = 1.75;
    await writeFile(path, JSON.stringify(onDisk), "utf8");

    expect(await readRunStatusFile(path, defaultFs)).toBeUndefined();
  });
});

const REVIEW_FLAGS: readonly NeedsReviewEntry[] = [{ key: "greeting", reasons: ["EQUALS_SOURCE"] }];
const FUZZY_HITS = [{ key: "greeting", previousSource: "Hello there", similarity: 0.9 }];
const USAGE = { inputTokens: 120, outputTokens: 80 };

async function writeRaw(content: unknown): Promise<string> {
  const dir = await makeTempDir();
  const path = join(dir, ".verbatra-local", "run-status.json");
  await mkdir(join(dir, ".verbatra-local"), { recursive: true });
  await writeFile(path, JSON.stringify(content), "utf8");
  return path;
}

async function readUnmarkedSnapshot(budget: RunBudget): Promise<RunStatusFile | undefined> {
  const path = await writeRaw({
    version: 1,
    generatedAt: "2026-01-01T00:00:00.000Z",
    usage: USAGE,
    budget,
    locales: [
      {
        locale: "de",
        status: "succeeded",
        needsReview: REVIEW_FLAGS,
        fuzzyHits: FUZZY_HITS,
        usage: USAGE,
      },
    ],
  });
  return readRunStatusFile(path, defaultFs);
}

describe("run-status persistence: a snapshot written before the budget was enforced", () => {
  it("drops a budget the older writer could not count, and keeps every other part of the file", async () => {
    const read = await readUnmarkedSnapshot({
      maxTokens: 1000,
      behavior: "stop",
      supported: false,
      tokensUsed: 0,
      exceeded: false,
    });

    expect(read).toBeDefined();
    expect(read).not.toHaveProperty("budget");
    expect(read?.usage).toEqual(USAGE);
    expect(read?.locales[0]?.needsReview).toEqual(REVIEW_FLAGS);
    expect(read?.locales[0]?.fuzzyHits).toEqual(FUZZY_HITS);
    expect(read?.locales[0]?.usage).toEqual(USAGE);
  });

  it("keeps a budget the older writer counted from the provider's own reported usage", async () => {
    const budget: RunBudget = {
      maxTokens: 1000,
      behavior: "warn",
      supported: true,
      tokensUsed: 640,
      exceeded: false,
    };

    expect((await readUnmarkedSnapshot(budget))?.budget).toEqual(budget);
  });
});

const ESTIMATED_BUDGET: RunBudget = {
  maxTokens: 800,
  behavior: "stop",
  supported: false,
  tokensUsed: 0,
  exceeded: false,
};

async function writtenJson(summary: RunSummary): Promise<Record<string, unknown>> {
  const dir = await makeTempDir();
  const path = join(dir, ".verbatra-local", "run-status.json");
  await writeRunStatusFile(path, buildRunStatusFile(summary), defaultFs);
  return JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
}

describe("run-status persistence: the counting marker a current writer leaves", () => {
  it("marks every snapshot it writes as reconciled, at the version an older reader accepts", async () => {
    const withBudget = await writtenJson(runSummary(ESTIMATED_BUDGET));
    const { budget: _omitted, ...withoutBudgetSummary } = runSummary(ESTIMATED_BUDGET);
    const withoutBudget = await writtenJson(withoutBudgetSummary);

    expect(withBudget.version).toBe(1);
    expect(withBudget.budgetCounting).toBe("reconciled");
    expect(withoutBudget.version).toBe(1);
    expect(withoutBudget.budgetCounting).toBe("reconciled");
  });

  it("keeps an estimated budget from a marked snapshot, and never hands the marker to a reader", async () => {
    const dir = await makeTempDir();
    const path = join(dir, ".verbatra-local", "run-status.json");
    await writeRunStatusFile(path, buildRunStatusFile(runSummary(ESTIMATED_BUDGET)), defaultFs);

    const read = await readRunStatusFile(path, defaultFs);

    expect(read?.budget).toEqual(ESTIMATED_BUDGET);
    expect(read).not.toHaveProperty("budgetCounting");
    expect(read?.budget).not.toHaveProperty("budgetCounting");
  });
});

const baseVersionReviewReasonSchema = z.enum([
  "LENGTH_RATIO_OUTLIER",
  "EQUALS_SOURCE",
  "GLOSSARY_TERM_MISSED",
  "INTEGRITY_REORDERED",
  "PROVIDER_DEGRADED",
]);

const baseVersionUsageSchema = z.object({
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
});

const baseVersionRunStatusFileSchema = z.object({
  version: z.number().int().positive(),
  generatedAt: z.string(),
  usage: baseVersionUsageSchema.optional(),
  budget: z
    .object({
      maxTokens: z.number().int().nonnegative(),
      behavior: z.enum(["warn", "stop"]),
      supported: z.boolean(),
      tokensUsed: z.number().int().nonnegative(),
      exceeded: z.boolean(),
    })
    .optional(),
  locales: z.array(
    z.object({
      locale: z.string(),
      status: z.enum(["succeeded", "partial", "failed"]),
      needsReview: z.array(
        z.object({ key: z.string(), reasons: z.array(baseVersionReviewReasonSchema) }),
      ),
      usage: baseVersionUsageSchema.optional(),
    }),
  ),
});

function readAsBaseVersion(
  content: unknown,
): z.infer<typeof baseVersionRunStatusFileSchema> | undefined {
  const result = baseVersionRunStatusFileSchema.safeParse(content);
  return result.success && result.data.version === 1 ? result.data : undefined;
}

describe("run-status persistence: an older reader still reads what a current writer leaves", () => {
  it("parses a marked snapshot with the published base-version schema and keeps the review queue", async () => {
    const onDisk = await writtenJson({
      ...runSummary(ESTIMATED_BUDGET),
      usage: USAGE,
      locales: [{ ...succeededLocale(), needsReview: REVIEW_FLAGS, usage: USAGE }],
    });

    const read = readAsBaseVersion(onDisk);

    expect(onDisk.budgetCounting).toBe("reconciled");
    expect(read).toBeDefined();
    expect(read?.locales[0]?.needsReview).toEqual(REVIEW_FLAGS);
    expect(read?.usage).toEqual(USAGE);
    expect(read?.budget).toEqual(ESTIMATED_BUDGET);
    expect(read).not.toHaveProperty("budgetCounting");
  });
});
