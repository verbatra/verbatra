import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Usage } from "@verbatra/ai-providers";
import { describe, expect, it } from "vitest";
import type { VerbatraConfig } from "../config/schema.js";
import { baseConfig, makeStubProvider, makeTempDir } from "../test-support.js";
import { translate } from "./translate-project.js";

const USAGE_100: Usage = { inputTokens: 60, outputTokens: 40 };

async function project(keyCount: number): Promise<string> {
  const dir = await makeTempDir();
  await mkdir(join(dir, "locales"));
  const source: Record<string, string> = {};
  for (let index = 0; index < keyCount; index += 1) {
    source[`k${index}`] = `v${index}`;
  }
  await writeFile(join(dir, "locales", "en.json"), `${JSON.stringify(source, null, 2)}\n`, "utf8");
  return dir;
}

const cfg = (overrides: Partial<VerbatraConfig> = {}): VerbatraConfig =>
  baseConfig({ targetLocales: ["de", "fr"], maxBatchSize: 2, ...overrides });

describe("translate: per-run maxTokens", () => {
  it("enforces the per-run ceiling as a hard stop on a config with no budget", async () => {
    const dir = await project(6);
    const stub = makeStubProvider({ usage: USAGE_100 });

    const summary = await translate(
      { config: cfg(), cwd: dir, maxTokens: 720 },
      { createProvider: () => stub.provider },
    );

    expect(summary.budget).toMatchObject({ maxTokens: 720, behavior: "stop", exceeded: true });
    expect(summary.budget?.tokensUsed).toBeLessThanOrEqual(720);
    expect(summary.partial).toEqual(["de"]);
    expect(summary.failed).toEqual(["fr"]);
    expect(stub.calls).toHaveLength(2);
    const notices = summary.locales.flatMap((locale) => locale.notices.map((n) => n.message));
    expect(notices.length).toBeGreaterThan(0);
    for (const message of notices) {
      expect(message).toMatch(/(the run's|its) own budget of 720 tokens/);
      expect(message).not.toContain("configured budget");
    }
  });

  it("turns a configured warn budget into a stop for the run", async () => {
    const dir = await project(6);
    const stub = makeStubProvider({ usage: USAGE_100 });

    const summary = await translate(
      { config: cfg({ maxTokens: 720, budgetBehavior: "warn" }), cwd: dir, maxTokens: 1_000_000 },
      { createProvider: () => stub.provider },
    );

    expect(summary.budget).toMatchObject({ maxTokens: 720, behavior: "stop" });
    expect(stub.calls).toHaveLength(2);
    const notice = summary.locales[0]?.notices.find((n) => n.code === "BUDGET_TOKENS_EXCEEDED");
    expect(notice?.message).toContain("the configured budget of 720 tokens");
  });

  it("applies the lower of the configured and the per-run ceiling", async () => {
    const dir = await project(6);
    const stub = makeStubProvider({ usage: USAGE_100 });

    const summary = await translate(
      { config: cfg({ maxTokens: 100_000, budgetBehavior: "stop" }), cwd: dir, maxTokens: 720 },
      { createProvider: () => stub.provider },
    );

    expect(summary.budget).toMatchObject({ maxTokens: 720, behavior: "stop" });
    expect(stub.calls).toHaveLength(2);
  });

  it("leaves the configured budget alone when no per-run ceiling is given", async () => {
    const dir = await project(2);
    const stub = makeStubProvider({ usage: USAGE_100 });

    const summary = await translate(
      { config: cfg({ maxTokens: 100_000 }), cwd: dir },
      { createProvider: () => stub.provider },
    );

    expect(summary.budget).toMatchObject({ maxTokens: 100_000, behavior: "warn" });
  });

  it("spends the whole per-run ceiling on the named locales and leaves the others unwritten", async () => {
    const dir = await project(6);
    const stub = makeStubProvider({ usage: USAGE_100 });

    const summary = await translate(
      { config: cfg(), cwd: dir, locales: ["fr"], maxTokens: 720 },
      { createProvider: () => stub.provider },
    );

    const fr = summary.locales[0];
    expect(summary.locales.map((locale) => locale.locale)).toEqual(["fr"]);
    expect(stub.calls.map((call) => call.request.targetLocale)).toEqual(["fr", "fr"]);
    expect(fr?.status).toBe("partial");
    expect([...(fr?.translated ?? [])].sort()).toEqual(["k0", "k1", "k2", "k3"]);
    expect(fr?.budgetWithheld).toEqual(["k4", "k5"]);
    expect(summary.budget).toMatchObject({ maxTokens: 720, behavior: "stop", exceeded: true });
    await expect(readFile(join(dir, "locales", "de.json"), "utf8")).rejects.toThrow();
  });

  it.each([0, -5, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    "refuses a per-run maxTokens of %s before any provider is constructed",
    async (maxTokens) => {
      const dir = await project(2);
      const factoryCalls: string[] = [];

      await expect(
        translate(
          { config: cfg(), cwd: dir, maxTokens },
          {
            createProvider: (config) => {
              factoryCalls.push(config.id);
              return makeStubProvider().provider;
            },
          },
        ),
      ).rejects.toMatchObject({ code: "MAX_TOKENS_INVALID" });
      expect(factoryCalls).toEqual([]);
    },
  );

  it("refuses a per-run ceiling combined with a concurrency above 1 on a live run", async () => {
    const dir = await project(2);

    await expect(
      translate(
        { config: cfg(), cwd: dir, maxTokens: 720, concurrency: 2 },
        { createProvider: () => makeStubProvider().provider },
      ),
    ).rejects.toMatchObject({ code: "CONCURRENCY_BUDGET_CONFLICT" });
  });

  it("allows a per-run ceiling with a concurrency above 1 on a dry run", async () => {
    const dir = await project(2);

    const summary = await translate({
      config: cfg(),
      cwd: dir,
      maxTokens: 720,
      concurrency: 2,
      dryRun: true,
    });

    expect(summary.dryRun).toBe(true);
  });
});
