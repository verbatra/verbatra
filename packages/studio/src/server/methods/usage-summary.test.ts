import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { LoadedConfig } from "@verbatra/sdk";
import { describe, expect, it } from "vitest";
import type { RpcHandlerDeps } from "../rpc.js";
import { type FixtureProject, makeFixtureProject } from "../test-support.js";
import { usageSummaryHandler } from "./usage-summary.js";

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

describe("usageSummaryHandler", () => {
  it("reports available: false when no run-status file exists yet, not an error", async () => {
    const project = await makeFixtureProject({ targetLocales: ["de"] }, {});
    try {
      const result = await usageSummaryHandler({}, deps(project));

      expect(result).toEqual({ available: false });
    } finally {
      await project.cleanup();
    }
  });

  it("reports available: false when the run-status file is not valid JSON", async () => {
    const project = await makeFixtureProject({ targetLocales: ["de"] }, {});
    try {
      await mkdir(join(project.root, ".verbatra-local"), { recursive: true });
      await writeFile(join(project.root, ".verbatra-local", "run-status.json"), "not json", "utf8");

      const result = await usageSummaryHandler({}, deps(project));

      expect(result).toEqual({ available: false });
    } finally {
      await project.cleanup();
    }
  });

  it("reports available: false when the file is valid JSON but does not match the schema", async () => {
    const project = await makeFixtureProject({ targetLocales: ["de"] }, {});
    try {
      await writeRunStatusFile(project, { unrelated: true });

      const result = await usageSummaryHandler({}, deps(project));

      expect(result).toEqual({ available: false });
    } finally {
      await project.cleanup();
    }
  });

  it("reports available: false when the file matches the schema but carries an unrecognized version", async () => {
    const project = await makeFixtureProject({ targetLocales: ["de"] }, {});
    try {
      await writeRunStatusFile(project, {
        version: 999,
        generatedAt: "2026-07-16T00:00:00.000Z",
        locales: [{ locale: "de", status: "succeeded", needsReview: [] }],
      });

      const result = await usageSummaryHandler({}, deps(project));

      expect(result).toEqual({ available: false });
    } finally {
      await project.cleanup();
    }
  });

  it("projects generatedAt and usage when the persisted snapshot has both usage and budget", async () => {
    const project = await makeFixtureProject({ targetLocales: ["de"] }, {});
    try {
      await writeRunStatusFile(project, {
        version: 1,
        generatedAt: "2026-07-16T00:00:00.000Z",
        usage: { inputTokens: 120, outputTokens: 340 },
        budget: {
          maxTokens: 1000,
          behavior: "warn",
          supported: true,
          tokensUsed: 460,
          exceeded: false,
        },
        locales: [{ locale: "de", status: "succeeded", needsReview: [] }],
      });

      const result = await usageSummaryHandler({}, deps(project));

      expect(result).toEqual({
        available: true,
        generatedAt: "2026-07-16T00:00:00.000Z",
        usage: { inputTokens: 120, outputTokens: 340 },
        budget: {
          maxTokens: 1000,
          behavior: "warn",
          supported: true,
          tokensUsed: 460,
          exceeded: false,
        },
      });
    } finally {
      await project.cleanup();
    }
  });

  it("never includes per-locale needsReview or per-locale usage in its result", async () => {
    const project = await makeFixtureProject({ targetLocales: ["de"] }, {});
    try {
      await writeRunStatusFile(project, {
        version: 1,
        generatedAt: "2026-07-16T00:00:00.000Z",
        usage: { inputTokens: 10, outputTokens: 20 },
        locales: [
          {
            locale: "de",
            status: "succeeded",
            needsReview: [{ key: "greeting", reasons: ["EQUALS_SOURCE"] }],
            usage: { inputTokens: 10, outputTokens: 20 },
          },
        ],
      });

      const result = await usageSummaryHandler({}, deps(project));

      expect(result).toEqual({
        available: true,
        generatedAt: "2026-07-16T00:00:00.000Z",
        usage: { inputTokens: 10, outputTokens: 20 },
      });
      expect(result).not.toHaveProperty("locales");
      expect(result).not.toHaveProperty("version");
    } finally {
      await project.cleanup();
    }
  });

  it("omits usage entirely, never a fabricated zero, when a token-less (DeepL-shaped) run reported a budget but no usage", async () => {
    const project = await makeFixtureProject({ targetLocales: ["de"] }, {});
    try {
      await writeRunStatusFile(project, {
        version: 1,
        generatedAt: "2026-07-16T00:00:00.000Z",
        budgetCounting: "reconciled",
        budget: {
          maxTokens: 1000,
          behavior: "stop",
          supported: false,
          tokensUsed: 394,
          exceeded: false,
        },
        locales: [{ locale: "de", status: "succeeded", needsReview: [] }],
      });

      const result = await usageSummaryHandler({}, deps(project));

      expect(result).toEqual({
        available: true,
        generatedAt: "2026-07-16T00:00:00.000Z",
        budget: {
          maxTokens: 1000,
          behavior: "stop",
          supported: false,
          tokensUsed: 394,
          exceeded: false,
        },
      });
      expect((result as { usage?: unknown }).usage).toBeUndefined();
    } finally {
      await project.cleanup();
    }
  });

  it("shows no budget, never a within-budget zero, for a token-less run recorded before the budget was enforced", async () => {
    const project = await makeFixtureProject({ targetLocales: ["de"] }, {});
    try {
      await writeRunStatusFile(project, {
        version: 1,
        generatedAt: "2026-07-16T00:00:00.000Z",
        budget: {
          maxTokens: 1000,
          behavior: "stop",
          supported: false,
          tokensUsed: 0,
          exceeded: false,
        },
        locales: [{ locale: "de", status: "succeeded", needsReview: [] }],
      });

      const result = await usageSummaryHandler({}, deps(project));

      expect(result).toEqual({ available: true, generatedAt: "2026-07-16T00:00:00.000Z" });
    } finally {
      await project.cleanup();
    }
  });

  it("omits budget entirely when no budget was configured for that run", async () => {
    const project = await makeFixtureProject({ targetLocales: ["de"] }, {});
    try {
      await writeRunStatusFile(project, {
        version: 1,
        generatedAt: "2026-07-16T00:00:00.000Z",
        usage: { inputTokens: 5, outputTokens: 7 },
        locales: [{ locale: "de", status: "succeeded", needsReview: [] }],
      });

      const result = await usageSummaryHandler({}, deps(project));

      expect(result).toEqual({
        available: true,
        generatedAt: "2026-07-16T00:00:00.000Z",
        usage: { inputTokens: 5, outputTokens: 7 },
      });
      expect((result as { budget?: unknown }).budget).toBeUndefined();
    } finally {
      await project.cleanup();
    }
  });

  it("reads the file fresh on every call, never caching it between requests", async () => {
    const project = await makeFixtureProject({ targetLocales: ["de"] }, {});
    try {
      const first = await usageSummaryHandler({}, deps(project));
      expect(first).toEqual({ available: false });

      await writeRunStatusFile(project, {
        version: 1,
        generatedAt: "2026-07-16T00:00:00.000Z",
        locales: [{ locale: "de", status: "succeeded", needsReview: [] }],
      });

      const second = await usageSummaryHandler({}, deps(project));
      expect(second.available).toBe(true);
    } finally {
      await project.cleanup();
    }
  });
});
