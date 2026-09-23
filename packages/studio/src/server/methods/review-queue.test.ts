import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { LoadedConfig } from "@verbatra/sdk";
import { describe, expect, it } from "vitest";
import type { RpcHandlerDeps } from "../rpc.js";
import { type FixtureProject, makeFixtureProject } from "../test-support.js";
import { reviewQueueHandler } from "./review-queue.js";

function deps(project: FixtureProject): RpcHandlerDeps {
  const loaded: LoadedConfig = {
    config: project.config,
    source: { kind: "override" },
    glossary: { source: "none" },
  };
  return { config: loaded, projectRoot: project.root };
}

async function writeRunStatusFile(project: FixtureProject, data: unknown): Promise<void> {
  await mkdir(join(project.root, ".verbatra-local"), { recursive: true });
  await writeFile(
    join(project.root, ".verbatra-local", "run-status.json"),
    `${JSON.stringify(data, null, 2)}\n`,
    "utf8",
  );
}

describe("reviewQueueHandler", () => {
  it("reports available: false when no run-status file exists yet, not an error", async () => {
    const project = await makeFixtureProject({ targetLocales: ["de"] }, {});
    try {
      const result = await reviewQueueHandler({}, deps(project));

      expect(result).toEqual({ available: false });
    } finally {
      await project.cleanup();
    }
  });

  it("passes through the flagged entries that still have an undecided translation", async () => {
    const project = await makeFixtureProject(
      { targetLocales: ["de"] },
      { greeting: "hello", farewell: "bye" },
    );
    try {
      await writeFile(
        join(project.root, "locales", "de.json"),
        `${JSON.stringify({ greeting: "hallo", farewell: "tschuss" })}\n`,
        "utf8",
      );
      await writeRunStatusFile(project, {
        version: 1,
        generatedAt: "2026-07-16T00:00:00.000Z",
        locales: [
          {
            locale: "de",
            status: "succeeded",
            needsReview: [
              { key: "greeting", reasons: ["EQUALS_SOURCE"] },
              { key: "farewell", reasons: ["LENGTH_RATIO_OUTLIER", "PROVIDER_DEGRADED"] },
            ],
          },
        ],
      });

      const result = await reviewQueueHandler({}, deps(project));

      expect(result).toEqual({
        available: true,
        version: 1,
        generatedAt: "2026-07-16T00:00:00.000Z",
        locales: [
          {
            locale: "de",
            status: "succeeded",
            needsReview: [
              {
                key: "greeting",
                reasons: ["EQUALS_SOURCE"],
                provenance: { origin: "unrecorded", reviewState: "unreviewed" },
              },
              {
                key: "farewell",
                reasons: ["LENGTH_RATIO_OUTLIER", "PROVIDER_DEGRADED"],
                provenance: { origin: "unrecorded", reviewState: "unreviewed" },
              },
            ],
          },
        ],
      });
    } finally {
      await project.cleanup();
    }
  });

  it("degrades a corrupt run-status file to available: false rather than throwing", async () => {
    const project = await makeFixtureProject({ targetLocales: ["de"] }, {});
    try {
      await mkdir(join(project.root, ".verbatra-local"), { recursive: true });
      await writeFile(join(project.root, ".verbatra-local", "run-status.json"), "not json", "utf8");

      const result = await reviewQueueHandler({}, deps(project));

      expect(result).toEqual({ available: false });
    } finally {
      await project.cleanup();
    }
  });

  it("reads the file fresh on every call, never caching it between requests", async () => {
    const project = await makeFixtureProject({ targetLocales: ["de"] }, {});
    try {
      const first = await reviewQueueHandler({}, deps(project));
      expect(first).toEqual({ available: false });

      await writeRunStatusFile(project, {
        version: 1,
        generatedAt: "2026-07-16T00:00:00.000Z",
        locales: [{ locale: "de", status: "succeeded", needsReview: [] }],
      });

      const second = await reviewQueueHandler({}, deps(project));
      expect(second.available).toBe(true);
    } finally {
      await project.cleanup();
    }
  });
});
