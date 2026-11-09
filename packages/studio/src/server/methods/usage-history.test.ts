import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { LoadedConfig, SdkFs } from "@verbatra/sdk";
import { describe, expect, it } from "vitest";
import { usageHistoryParamsSchema } from "../../shared/rpc/usage-history.js";
import type { RpcHandlerDeps } from "../rpc.js";
import { type FixtureProject, makeFixtureProject } from "../test-support.js";
import { usageHistoryHandler } from "./usage-history.js";

function deps(project: FixtureProject): RpcHandlerDeps {
  const loaded: LoadedConfig = {
    config: project.config,
    source: { kind: "override" },
    glossary: { source: "none" },
  };
  return { config: loaded, projectRoot: project.root };
}

function record(at: string, translated = 1): string {
  return JSON.stringify({
    version: 1,
    at,
    trigger: "translate",
    provider: "anthropic",
    model: "claude-sonnet-5-5",
    usage: { inputTokens: 100, outputTokens: 50 },
    cost: {
      pricing: "priced",
      basis: "usage",
      rateKey: "anthropic/claude-sonnet-5-5",
      currency: "USD",
      asOf: "2026-01-01",
      amount: 0.5,
    },
    locales: [{ locale: "de", status: "succeeded", translated }],
  });
}

async function writeHistory(project: FixtureProject, text: string): Promise<void> {
  await mkdir(join(project.root, ".verbatra-local"), { recursive: true });
  await writeFile(join(project.root, ".verbatra-local", "run-history.jsonl"), text, "utf8");
}

describe("usageHistoryHandler", () => {
  it("answers an empty history, not an error, when no run was ever recorded", async () => {
    const project = await makeFixtureProject({ targetLocales: ["de"] }, {});
    try {
      const result = await usageHistoryHandler({}, deps(project));

      expect(result).toEqual({ records: [], total: 0, unreadableRecords: 0 });
    } finally {
      await project.cleanup();
    }
  });

  it("returns the newest record first and counts a bad line instead of hiding it", async () => {
    const project = await makeFixtureProject({ targetLocales: ["de"] }, {});
    try {
      await writeHistory(
        project,
        `${record("2026-07-01T00:00:00.000Z")}\nnot json\n${record("2026-07-02T00:00:00.000Z")}\n`,
      );

      const result = await usageHistoryHandler({}, deps(project));

      expect(result.records.map((entry) => entry.at)).toEqual([
        "2026-07-02T00:00:00.000Z",
        "2026-07-01T00:00:00.000Z",
      ]);
      expect(result.total).toBe(2);
      expect(result.unreadableRecords).toBe(1);
    } finally {
      await project.cleanup();
    }
  });

  it("reduces a limit above the maximum instead of refusing it", async () => {
    const project = await makeFixtureProject({ targetLocales: ["de"] }, {});
    try {
      const lines = Array.from({ length: 205 }, (_, index) =>
        record(new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString()),
      );
      await writeHistory(project, `${lines.join("\n")}\n`);

      const result = await usageHistoryHandler({ limit: 100000 }, deps(project));

      expect(result.records).toHaveLength(200);
      expect(result.total).toBe(205);
    } finally {
      await project.cleanup();
    }
  });

  it("passes a smaller limit through, keeping the newest records and the full total", async () => {
    const project = await makeFixtureProject({ targetLocales: ["de"] }, {});
    try {
      await writeHistory(
        project,
        `${record("2026-07-01T00:00:00.000Z")}\n${record("2026-07-02T00:00:00.000Z")}\n${record("2026-07-03T00:00:00.000Z")}\n`,
      );

      const result = await usageHistoryHandler({ limit: 2 }, deps(project));

      expect(result.records.map((entry) => entry.at)).toEqual([
        "2026-07-03T00:00:00.000Z",
        "2026-07-02T00:00:00.000Z",
      ]);
      expect(result.total).toBe(3);
    } finally {
      await project.cleanup();
    }
  });

  it("reads through an injected file system and reports an oversized file as unavailable, not empty", async () => {
    const project = await makeFixtureProject({ targetLocales: ["de"] }, {});
    try {
      const fs = { readBytesBounded: async () => ({ kind: "too-large" }) } as unknown as SdkFs;

      const result = await usageHistoryHandler({}, { ...deps(project), fs });

      expect(result).toEqual({
        records: [],
        total: 0,
        unreadableRecords: 0,
        unavailable: "too-large",
      });
    } finally {
      await project.cleanup();
    }
  });

  it("strips a key name and a text a line carries beyond the schema", async () => {
    const project = await makeFixtureProject({ targetLocales: ["de"] }, {});
    try {
      const line = JSON.parse(record("2026-07-01T00:00:00.000Z")) as {
        locales: Record<string, unknown>[];
      };
      const hostile = {
        ...line,
        key: "greeting",
        text: "Hello there",
        locales: line.locales.map((locale) => ({ ...locale, keys: ["greeting"], value: "Hallo" })),
      };
      await writeHistory(project, `${JSON.stringify(hostile)}\n`);

      const result = await usageHistoryHandler({}, deps(project));

      expect(result.records).toHaveLength(1);
      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain("greeting");
      expect(serialized).not.toContain("Hello there");
      expect(serialized).not.toContain("Hallo");
    } finally {
      await project.cleanup();
    }
  });
});

describe("usageHistoryParamsSchema", () => {
  it("accepts no parameters and a numeric limit, and refuses anything else", () => {
    expect(usageHistoryParamsSchema.safeParse({}).success).toBe(true);
    expect(usageHistoryParamsSchema.safeParse({ limit: 5 }).success).toBe(true);
    expect(usageHistoryParamsSchema.safeParse({ limit: "5" }).success).toBe(false);
    expect(usageHistoryParamsSchema.safeParse({ extra: true }).success).toBe(false);
  });
});
