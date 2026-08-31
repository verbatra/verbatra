import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { makeContext, makeTempDir, writeJsonFile } from "../test-support.js";
import { reviewQueueTool } from "./review-queue.js";

describe("review.queue", () => {
  it("reports available: false when no run has completed in this project yet", async () => {
    const dir = await makeTempDir();

    const outcome = await reviewQueueTool.execute({}, makeContext({ cwd: dir }));

    expect(outcome).toEqual({ kind: "ok", result: { available: false } });
  });

  it("reports the flagged keys from the last run's status file", async () => {
    const dir = await makeTempDir();
    await mkdir(join(dir, ".verbatra-local"), { recursive: true });
    await writeJsonFile(join(dir, ".verbatra-local", "run-status.json"), {
      version: 1,
      generatedAt: "2026-01-01T00:00:00.000Z",
      locales: [
        {
          locale: "de",
          status: "succeeded",
          needsReview: [{ key: "greeting", reasons: ["EQUALS_SOURCE"] }],
        },
      ],
    });

    const outcome = await reviewQueueTool.execute({}, makeContext({ cwd: dir }));

    expect(outcome).toMatchObject({
      kind: "ok",
      result: {
        available: true,
        locales: [{ locale: "de", needsReview: [{ key: "greeting", reasons: ["EQUALS_SOURCE"] }] }],
      },
    });
  });

  it("rejects an unrecognized parameter", async () => {
    const outcome = await reviewQueueTool.execute({ bogus: true }, makeContext());

    expect(outcome.kind).toBe("invalid");
  });
});
