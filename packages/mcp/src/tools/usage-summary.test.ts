import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { makeContext, makeTempDir, trackFsCalls, writeJsonFile } from "../test-support.js";
import { usageSummaryTool } from "./usage-summary.js";

describe("usage.summary", () => {
  it("reports available: false when no run has completed in this project yet", async () => {
    const dir = await makeTempDir();

    const outcome = await usageSummaryTool.execute({}, makeContext({ cwd: dir }));

    expect(outcome).toEqual({
      kind: "ok",
      result: { available: false },
      structuredContent: { available: false },
    });
  });

  it("reports token usage and budget status from the last run", async () => {
    const dir = await makeTempDir();
    await mkdir(join(dir, ".verbatra-local"), { recursive: true });
    await writeJsonFile(join(dir, ".verbatra-local", "run-status.json"), {
      version: 1,
      generatedAt: "2026-01-01T00:00:00.000Z",
      usage: { inputTokens: 100, outputTokens: 50 },
      budget: {
        maxTokens: 1000,
        behavior: "warn",
        supported: true,
        tokensUsed: 150,
        exceeded: false,
      },
      locales: [],
    });

    const outcome = await usageSummaryTool.execute({}, makeContext({ cwd: dir }));

    expect(outcome).toEqual({
      kind: "ok",
      result: {
        available: true,
        generatedAt: "2026-01-01T00:00:00.000Z",
        usage: { inputTokens: 100, outputTokens: 50 },
        budget: {
          maxTokens: 1000,
          behavior: "warn",
          supported: true,
          tokensUsed: 150,
          exceeded: false,
        },
      },
      structuredContent: {
        available: true,
        generatedAt: "2026-01-01T00:00:00.000Z",
        usage: { inputTokens: 100, outputTokens: 50 },
        budget: {
          maxTokens: 1000,
          behavior: "warn",
          supported: true,
          tokensUsed: 150,
          exceeded: false,
        },
      },
    });
  });

  it("omits usage and budget when the run recorded neither", async () => {
    const dir = await makeTempDir();
    await mkdir(join(dir, ".verbatra-local"), { recursive: true });
    await writeJsonFile(join(dir, ".verbatra-local", "run-status.json"), {
      version: 1,
      generatedAt: "2026-01-01T00:00:00.000Z",
      locales: [],
    });

    const outcome = await usageSummaryTool.execute({}, makeContext({ cwd: dir }));

    expect(outcome).toMatchObject({ kind: "ok", result: { available: true } });
    if (outcome.kind === "ok") {
      expect(Object.hasOwn(outcome.result as object, "usage")).toBe(false);
      expect(Object.hasOwn(outcome.result as object, "budget")).toBe(false);
    }
  });

  it("rejects an unrecognized parameter", async () => {
    const outcome = await usageSummaryTool.execute({ bogus: true }, makeContext());

    expect(outcome.kind).toBe("invalid");
  });

  it("uses an injected fs to read the run status file rather than the real filesystem", async () => {
    const dir = await makeTempDir();
    const { fs, counts } = trackFsCalls();

    const outcome = await usageSummaryTool.execute({}, makeContext({ cwd: dir, fs }));

    expect(outcome).toMatchObject({ kind: "ok", result: { available: false } });
    expect(counts.readFileBounded).toBeGreaterThan(0);
  });
});
