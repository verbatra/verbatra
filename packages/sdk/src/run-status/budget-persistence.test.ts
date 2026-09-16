import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { LocaleSummary, RunBudget, RunSummary } from "../flow/summary.js";
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

async function readLegacySnapshot(budget: RunBudget): Promise<RunStatusFile | undefined> {
  const dir = await makeTempDir();
  const path = join(dir, ".verbatra-local", "run-status.json");
  await mkdir(join(dir, ".verbatra-local"), { recursive: true });
  await writeFile(
    path,
    JSON.stringify({
      version: 1,
      generatedAt: "2026-01-01T00:00:00.000Z",
      budget,
      locales: [
        {
          locale: "de",
          status: "succeeded",
          needsReview: [{ key: "greeting", reasons: ["EQUALS_SOURCE"] }],
        },
      ],
    }),
    "utf8",
  );
  return readRunStatusFile(path, defaultFs);
}

describe("run-status persistence: a snapshot written before the budget was enforced", () => {
  it("drops a budget the older writer could not count, rather than presenting its zero as a count", async () => {
    const read = await readLegacySnapshot({
      maxTokens: 1000,
      behavior: "stop",
      supported: false,
      tokensUsed: 0,
      exceeded: false,
    });

    expect(read).toBeDefined();
    expect(read).not.toHaveProperty("budget");
    expect(read?.locales[0]?.needsReview).toEqual([
      { key: "greeting", reasons: ["EQUALS_SOURCE"] },
    ]);
  });

  it("keeps a budget the older writer counted from the provider's own reported usage", async () => {
    const budget: RunBudget = {
      maxTokens: 1000,
      behavior: "warn",
      supported: true,
      tokensUsed: 640,
      exceeded: false,
    };

    expect((await readLegacySnapshot(budget))?.budget).toEqual(budget);
  });

  it("writes a new snapshot at a version the older reader rejects, so it cannot misread supported", () => {
    const file = buildRunStatusFile(
      runSummary({
        maxTokens: 800,
        behavior: "stop",
        supported: false,
        tokensUsed: 0,
        exceeded: false,
      }),
    );

    expect(file.version).toBeGreaterThan(1);
  });
});
