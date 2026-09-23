import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { approveEntry, editEntry } from "@verbatra/sdk";
import { describe, expect, it } from "vitest";
import {
  baseVerbatraConfig,
  makeContext,
  makeProject,
  makeTempDir,
  trackAdapterRegistryCalls,
  trackFsCalls,
  writeJsonFile,
} from "../test-support.js";
import { reviewQueueTool } from "./review-queue.js";

async function writeRunStatus(dir: string, keys: readonly string[]): Promise<void> {
  await mkdir(join(dir, ".verbatra-local"), { recursive: true });
  await writeJsonFile(join(dir, ".verbatra-local", "run-status.json"), {
    version: 1,
    generatedAt: "2026-01-01T00:00:00.000Z",
    locales: [
      {
        locale: "de",
        status: "succeeded",
        needsReview: keys.map((key) => ({ key, reasons: ["EQUALS_SOURCE"] })),
      },
    ],
  });
}

describe("review.queue", () => {
  it("reports available: false when no run has completed in this project yet", async () => {
    const dir = await makeTempDir();

    const outcome = await reviewQueueTool.execute({}, makeContext({ cwd: dir }));

    expect(outcome).toEqual({ kind: "ok", result: { available: false } });
  });

  it("reports the flagged keys from the last run's status file", async () => {
    const dir = await makeProject({ greeting: "Hello" }, { de: { greeting: "Hallo" } });
    await writeRunStatus(dir, ["greeting"]);

    const outcome = await reviewQueueTool.execute({}, makeContext({ cwd: dir }));

    expect(outcome).toMatchObject({
      kind: "ok",
      result: {
        available: true,
        locales: [
          {
            locale: "de",
            needsReview: [
              {
                key: "greeting",
                reasons: ["EQUALS_SOURCE"],
                provenance: { origin: "unrecorded", reviewState: "unreviewed" },
              },
            ],
          },
        ],
      },
    });
  });

  it("leaves out a flagged key that was approved or no longer has a translation", async () => {
    const dir = await makeProject({ greeting: "Hello", title: "Title" }, { de: {} });
    await writeRunStatus(dir, ["greeting", "title"]);
    const config = baseVerbatraConfig();
    await editEntry({ config, cwd: dir, locale: "de", key: "greeting", value: "Hallo" });
    await approveEntry({ config, cwd: dir, locale: "de", key: "greeting", expectedValue: "Hallo" });

    const outcome = await reviewQueueTool.execute({}, makeContext({ cwd: dir }));

    expect(outcome).toMatchObject({
      kind: "ok",
      result: { available: true, locales: [{ locale: "de", needsReview: [] }] },
    });
  });

  it("reads the target through an injected adapter registry", async () => {
    const dir = await makeProject({ greeting: "Hello" }, { de: { greeting: "Hallo" } });
    await writeRunStatus(dir, ["greeting"]);
    const { adapterRegistry, counts } = trackAdapterRegistryCalls();

    await reviewQueueTool.execute({}, makeContext({ cwd: dir, adapterRegistry }));

    expect(counts.resolveCalls).toBeGreaterThan(0);
  });

  it("rejects an unrecognized parameter", async () => {
    const outcome = await reviewQueueTool.execute({ bogus: true }, makeContext());

    expect(outcome.kind).toBe("invalid");
  });

  it("uses an injected fs to read the run status file rather than the real filesystem", async () => {
    const dir = await makeTempDir();
    const { fs, counts } = trackFsCalls();

    const outcome = await reviewQueueTool.execute({}, makeContext({ cwd: dir, fs }));

    expect(outcome).toEqual({ kind: "ok", result: { available: false } });
    expect(counts.readFileBounded).toBeGreaterThan(0);
  });
});
