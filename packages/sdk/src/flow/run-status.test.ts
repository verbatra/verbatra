import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { defaultFs } from "../fs.js";
import {
  buildRunStatusFile,
  runStatusFilePath,
  writeRunStatusFile,
} from "../run-status/run-status-file.js";
import { makeFakeFs, makeTempDir } from "../test-support.js";
import { runStatus } from "./run-status.js";
import type { RunSummary } from "./summary.js";

function runSummary(): RunSummary {
  return {
    dryRun: false,
    locales: [
      {
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
        needsReview: [{ key: "greeting", reasons: ["EQUALS_SOURCE"] }],
        unfilled: [],
        malformedRows: [],
        duplicateKeys: [],
      },
    ],
    succeeded: ["de"],
    partial: [],
    failed: [],
  };
}

describe("runStatus", () => {
  it("returns available: false when no run-status file exists yet", async () => {
    const dir = await makeTempDir();
    expect(await runStatus({ cwd: dir })).toEqual({ available: false });
  });

  it("defaults cwd to process.cwd() and fs to the real file system", async () => {
    const result = await runStatus();
    expect(result).toEqual({ available: false });
  });

  it("returns available: true with the persisted fields when a file exists and matches the schema", async () => {
    const dir = await makeTempDir();
    const file = buildRunStatusFile(runSummary(), "2026-01-01T00:00:00.000Z");
    await writeRunStatusFile(runStatusFilePath(dir), file, defaultFs);

    const result = await runStatus({ cwd: dir });

    expect(result).toEqual({ available: true, ...file });
  });

  it("degrades a corrupt file to available: false rather than throwing", async () => {
    const dir = await makeTempDir();
    await mkdir(join(dir, ".verbatra-local"));
    await writeFile(join(dir, ".verbatra-local", "run-status.json"), "{ not json", "utf8");

    await expect(runStatus({ cwd: dir })).resolves.toEqual({ available: false });
  });

  it("degrades a rejecting fs read to available: false rather than throwing", async () => {
    const fs = makeFakeFs({
      readFileBounded: async () => {
        throw new Error("the backing store is unreachable");
      },
    });

    await expect(runStatus({ cwd: "/anywhere" }, { fs })).resolves.toEqual({ available: false });
  });

  it("never calls a provider or writes any file, accepting an injected fs", async () => {
    let writeCalled = false;
    const fs = makeFakeFs({
      writeFile: async () => {
        writeCalled = true;
      },
    });

    const result = await runStatus({ cwd: "/anywhere" }, { fs });

    expect(result).toEqual({ available: false });
    expect(writeCalled).toBe(false);
  });
});
