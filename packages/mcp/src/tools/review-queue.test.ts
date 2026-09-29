import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { approveEntry, editEntry } from "@verbatra/sdk";
import { describe, expect, it } from "vitest";
import {
  baseVerbatraConfig,
  makeContext,
  makeProject,
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

async function agentProject(): Promise<string> {
  const dir = await makeProject({ greeting: "Hello", title: "Title" }, { de: {} });
  const config = baseVerbatraConfig();
  for (const [key, value] of [
    ["greeting", "Hallo"],
    ["title", "Titel"],
  ] as const) {
    await editEntry({ config, cwd: dir, locale: "de", key, value, actor: "agent" });
  }
  return dir;
}

const AGENT = { origin: "agent", reviewState: "unreviewed" } as const;

describe("review.queue", () => {
  it("lists every unapproved machine-class value from the committed files", async () => {
    const dir = await agentProject();

    const outcome = await reviewQueueTool.execute({}, makeContext({ cwd: dir }));

    expect(outcome).toEqual({
      kind: "ok",
      result: {
        available: true,
        locales: [
          {
            locale: "de",
            needsReview: [
              { key: "greeting", reasons: [], provenance: AGENT },
              { key: "title", reasons: [], provenance: AGENT },
            ],
          },
        ],
      },
    });
  });

  it("adds the last run's flags and the time it finished", async () => {
    const dir = await agentProject();
    await writeRunStatus(dir, ["greeting"]);

    const outcome = await reviewQueueTool.execute({}, makeContext({ cwd: dir }));

    expect(outcome).toMatchObject({
      kind: "ok",
      result: {
        lastRunAt: "2026-01-01T00:00:00.000Z",
        locales: [{ needsReview: [{ key: "greeting", reasons: ["EQUALS_SOURCE"] }, {}] }],
      },
    });
  });

  it("leaves out an approved value and a value a person wrote", async () => {
    const dir = await agentProject();
    const config = baseVerbatraConfig();
    await approveEntry({ config, cwd: dir, locale: "de", key: "greeting", expectedValue: "Hallo" });
    await editEntry({ config, cwd: dir, locale: "de", key: "title", value: "Überschrift" });

    const outcome = await reviewQueueTool.execute({}, makeContext({ cwd: dir }));

    expect(outcome).toMatchObject({
      kind: "ok",
      result: { available: true, locales: [{ locale: "de", needsReview: [] }] },
    });
  });

  it("reports available: false when the provenance file cannot be read", async () => {
    const dir = await agentProject();
    await writeFile(join(dir, "verbatra.provenance.json"), "{ not json", "utf8");

    const outcome = await reviewQueueTool.execute({}, makeContext({ cwd: dir }));

    expect(outcome).toEqual({
      kind: "ok",
      result: { available: false, reason: "provenance-unreadable" },
    });
  });

  it("reads the target through an injected adapter registry", async () => {
    const dir = await agentProject();
    const { adapterRegistry, counts } = trackAdapterRegistryCalls();

    await reviewQueueTool.execute({}, makeContext({ cwd: dir, adapterRegistry }));

    expect(counts.resolveCalls).toBeGreaterThan(0);
  });

  it("uses an injected fs rather than the real filesystem", async () => {
    const dir = await agentProject();
    const { fs, counts } = trackFsCalls();

    await reviewQueueTool.execute({}, makeContext({ cwd: dir, fs }));

    expect(counts.readFileBounded).toBeGreaterThan(0);
  });

  it("rejects an unrecognized parameter", async () => {
    const outcome = await reviewQueueTool.execute({ bogus: true }, makeContext());

    expect(outcome.kind).toBe("invalid");
  });
});
