import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  TranslateRequest,
  TranslateResult,
  TranslationProvider,
  Usage,
} from "@verbatra/ai-providers";
import type { PlaceholderIntegrityResult } from "@verbatra/core";
import { describe, expect, it } from "vitest";
import type { VerbatraConfig } from "../config/schema.js";
import { baseConfig, makeStubProvider, makeTempDir, readJsonFile } from "../test-support.js";
import { runStatus } from "./run-status.js";
import { translate } from "./translate-project.js";

async function project(
  source: Record<string, unknown>,
  targets: Record<string, Record<string, unknown> | undefined>,
): Promise<string> {
  const dir = await makeTempDir();
  await mkdir(join(dir, "locales"));
  await writeFile(join(dir, "locales", "en.json"), `${JSON.stringify(source, null, 2)}\n`, "utf8");
  for (const [locale, obj] of Object.entries(targets)) {
    if (obj !== undefined) {
      await writeFile(
        join(dir, "locales", `${locale}.json`),
        `${JSON.stringify(obj, null, 2)}\n`,
        "utf8",
      );
    }
  }
  return dir;
}

function keyedSource(count: number): Record<string, string> {
  const source: Record<string, string> = {};
  for (let index = 0; index < count; index += 1) {
    source[`k${index}`] = `v${index}`;
  }
  return source;
}

const cfg = (overrides: Partial<VerbatraConfig> = {}): VerbatraConfig =>
  baseConfig({ targetLocales: ["de"], ...overrides });

function targetPath(dir: string, locale: string): string {
  return join(dir, "locales", `${locale}.json`);
}

async function readLock(dir: string): Promise<Record<string, Record<string, string>>> {
  const lock = (await readJsonFile(join(dir, "verbatra.lock.json"))) as {
    locales: Record<string, Record<string, string>>;
  };
  return lock.locales;
}

const USAGE_100: Usage = { inputTokens: 60, outputTokens: 40 };

describe("translate: usage aggregation", () => {
  it("stays undefined for every locale and the run when nothing reported usage (dry-run)", async () => {
    const dir = await project(keyedSource(2), { de: undefined });

    const summary = await translate({ config: cfg(), cwd: dir, dryRun: true });

    expect(summary.usage).toBeUndefined();
    expect(summary.locales[0]?.usage).toBeUndefined();
  });

  it("sums a single sub-batch's usage onto the locale and the run", async () => {
    const dir = await project(keyedSource(2), { de: undefined });
    const stub = makeStubProvider({ usage: USAGE_100 });

    const summary = await translate(
      { config: cfg(), cwd: dir },
      { createProvider: () => stub.provider },
    );

    expect(summary.locales[0]?.usage).toEqual({ inputTokens: 60, outputTokens: 40 });
    expect(summary.usage).toEqual({ inputTokens: 60, outputTokens: 40 });
  });

  it("sums multiple sub-batches within one locale", async () => {
    const dir = await project(keyedSource(4), { de: undefined });
    const stub = makeStubProvider({ usage: USAGE_100 });

    const summary = await translate(
      { config: cfg({ maxBatchSize: 2 }), cwd: dir },
      { createProvider: () => stub.provider },
    );

    expect(summary.locales[0]?.usage).toEqual({ inputTokens: 120, outputTokens: 80 });
    expect(summary.usage).toEqual({ inputTokens: 120, outputTokens: 80 });
  });

  it("sums usage across multiple locales onto the run total", async () => {
    const dir = await project(keyedSource(2), { de: undefined, fr: undefined });
    const stub = makeStubProvider({ usage: USAGE_100 });

    const summary = await translate(
      { config: cfg({ targetLocales: ["de", "fr"] }), cwd: dir },
      { createProvider: () => stub.provider },
    );

    expect(summary.locales.map((l) => l.usage)).toEqual([
      { inputTokens: 60, outputTokens: 40 },
      { inputTokens: 60, outputTokens: 40 },
    ]);
    expect(summary.usage).toEqual({ inputTokens: 120, outputTokens: 80 });
  });

  it("a sub-batch whose provider call throws contributes nothing to the total", async () => {
    const dir = await project(keyedSource(4), { de: undefined });
    let call = 0;
    const provider: TranslationProvider = {
      id: "flaky",
      kind: "llm",
      supportsGlossary: true,
      translateBatch: (request: TranslateRequest): Promise<TranslateResult> => {
        call += 1;
        if (call === 2) {
          return Promise.reject(new Error("boom"));
        }
        const values = new Map<string, string>();
        const integrity = new Map<string, PlaceholderIntegrityResult>();
        for (const entry of request.entries) {
          values.set(entry.key, `[${request.targetLocale}] ${entry.value}`);
          integrity.set(entry.key, { matches: true, missing: [], extra: [], reordered: false });
        }
        return Promise.resolve({ values, integrity, usage: USAGE_100 });
      },
    };

    const summary = await translate(
      { config: cfg({ maxBatchSize: 2 }), cwd: dir },
      { createProvider: () => provider },
    );

    expect(summary.locales[0]?.usage).toEqual({ inputTokens: 60, outputTokens: 40 });
  });
});

describe("translate: budget just-under the ceiling", () => {
  it("leaves exceeded false and withholds nothing when the total stays under maxTokens", async () => {
    const dir = await project(keyedSource(2), { de: undefined, fr: undefined });
    const stub = makeStubProvider({ usage: USAGE_100 });

    const summary = await translate(
      { config: cfg({ targetLocales: ["de", "fr"], maxTokens: 1000 }), cwd: dir },
      { createProvider: () => stub.provider },
    );

    expect(summary.budget).toEqual({
      maxTokens: 1000,
      behavior: "warn",
      supported: true,
      tokensUsed: 200,
      exceeded: false,
    });
    expect(summary.locales.flatMap((l) => l.budgetWithheld)).toEqual([]);
    expect(
      summary.locales.every((l) => l.notices.every((n) => n.code !== "BUDGET_TOKENS_EXCEEDED")),
    ).toBe(true);
  });
});

describe("translate: budget crossed, warn behavior", () => {
  it("continues the run fully, withholds nothing, and adds exactly one notice on the tripping locale", async () => {
    const dir = await project(keyedSource(2), { de: undefined, fr: undefined, it: undefined });
    const stub = makeStubProvider({ usage: USAGE_100 });

    const summary = await translate(
      {
        config: cfg({ targetLocales: ["de", "fr", "it"], maxTokens: 50, budgetBehavior: "warn" }),
        cwd: dir,
      },
      { createProvider: () => stub.provider },
    );

    expect(summary.budget?.exceeded).toBe(true);
    expect(summary.budget?.behavior).toBe("warn");
    expect(summary.locales.every((l) => l.status === "succeeded")).toBe(true);
    expect(summary.locales.flatMap((l) => l.translated)).toEqual([
      "k0",
      "k1",
      "k0",
      "k1",
      "k0",
      "k1",
    ]);
    expect(summary.locales.flatMap((l) => l.budgetWithheld)).toEqual([]);

    const notices = summary.locales.flatMap((l) => l.notices.map((n) => n.code));
    expect(notices.filter((code) => code === "BUDGET_TOKENS_EXCEEDED")).toHaveLength(1);
    expect(summary.locales[0]?.notices.map((n) => n.code)).toContain("BUDGET_TOKENS_EXCEEDED");
  });
});

describe("translate: budget crossed, stop behavior", () => {
  it("withholds the sub-batch that would cross, in-locale, and skips later locales entirely", async () => {
    const dir = await project(keyedSource(6), { de: undefined, fr: undefined });
    const stub = makeStubProvider({ usage: USAGE_100 });

    const summary = await translate(
      {
        config: cfg({
          targetLocales: ["de", "fr"],
          maxBatchSize: 2,
          maxTokens: 500,
          budgetBehavior: "stop",
        }),
        cwd: dir,
      },
      { createProvider: () => stub.provider },
    );

    const de = summary.locales.find((l) => l.locale === "de");
    const fr = summary.locales.find((l) => l.locale === "fr");

    expect(de?.status).toBe("partial");
    expect([...(de?.translated ?? [])].sort()).toEqual(["k0", "k1", "k2", "k3"]);
    expect(de?.budgetWithheld).toEqual(["k4", "k5"]);
    expect(de?.notices.map((n) => n.code)).toContain("BUDGET_TOKENS_EXCEEDED");

    expect(fr?.status).toBe("failed");
    expect(fr?.translated).toEqual([]);
    expect([...(fr?.budgetWithheld ?? [])].sort()).toEqual(["k0", "k1", "k2", "k3", "k4", "k5"]);
    expect(fr?.notices.map((n) => n.code)).toContain("BUDGET_TOKENS_EXCEEDED");

    expect(summary.succeeded).toEqual([]);
    expect(summary.partial).toEqual(["de"]);
    expect(summary.failed).toEqual(["fr"]);

    expect(summary.budget).toEqual({
      maxTokens: 500,
      behavior: "stop",
      supported: true,
      tokensUsed: 200,
      exceeded: true,
    });

    const deFile = (await readJsonFile(targetPath(dir, "de"))) as Record<string, string>;
    expect(deFile.k0).toBe("[de] v0");
    expect(deFile.k4).toBeUndefined();
  });

  it("never lets the run's counted total pass the ceiling it was given", async () => {
    const dir = await project(keyedSource(6), { de: undefined, fr: undefined });
    const stub = makeStubProvider({ usage: USAGE_100 });

    const summary = await translate(
      {
        config: cfg({
          targetLocales: ["de", "fr"],
          maxBatchSize: 2,
          maxTokens: 500,
          budgetBehavior: "stop",
        }),
        cwd: dir,
      },
      { createProvider: () => stub.provider },
    );

    expect(summary.budget?.tokensUsed).toBeLessThanOrEqual(500);
    expect(stub.calls).toHaveLength(2);
  });

  it("tells a later locale the run had already stopped, not a projection it never computed", async () => {
    const dir = await project(keyedSource(6), { de: undefined, fr: undefined });
    const stub = makeStubProvider({ usage: USAGE_100 });

    const summary = await translate(
      {
        config: cfg({
          targetLocales: ["de", "fr"],
          maxBatchSize: 2,
          maxTokens: 500,
          budgetBehavior: "stop",
        }),
        cwd: dir,
      },
      { createProvider: () => stub.provider },
    );

    const deNotice = summary.locales
      .find((l) => l.locale === "de")
      ?.notices.find((n) => n.code === "BUDGET_TOKENS_EXCEEDED");
    const frNotice = summary.locales
      .find((l) => l.locale === "fr")
      ?.notices.find((n) => n.code === "BUDGET_TOKENS_EXCEEDED");

    expect(deNotice?.message).toContain("projected at");
    expect(frNotice?.message).toContain("had already reached");
    expect(frNotice?.message).not.toContain("projected at");
  });

  it("can still land above the ceiling by one call's reconciliation delta, and stops there", async () => {
    const dir = await project(keyedSource(6), { de: undefined });
    const stub = makeStubProvider({ usage: { inputTokens: 4_000, outputTokens: 1_000 } });

    const summary = await translate(
      {
        config: cfg({ maxBatchSize: 2, maxTokens: 500, budgetBehavior: "stop" }),
        cwd: dir,
      },
      { createProvider: () => stub.provider },
    );

    expect(stub.calls).toHaveLength(1);
    expect(summary.budget?.tokensUsed).toBe(5_000);
    expect([...(summary.locales[0]?.budgetWithheld ?? [])].sort()).toEqual([
      "k2",
      "k3",
      "k4",
      "k5",
    ]);
  });
});

function failingOnCall(failingCall: number, usage: Usage): TranslationProvider {
  let call = 0;
  return {
    id: "failing-on-call",
    kind: "llm",
    supportsGlossary: true,
    translateBatch: (request: TranslateRequest): Promise<TranslateResult> => {
      call += 1;
      if (call >= failingCall) {
        return Promise.reject(new Error("boom"));
      }
      const values = new Map<string, string>();
      const integrity = new Map<string, PlaceholderIntegrityResult>();
      for (const entry of request.entries) {
        values.set(entry.key, `[${request.targetLocale}] ${entry.value}`);
        integrity.set(entry.key, { matches: true, missing: [], extra: [], reordered: false });
      }
      return Promise.resolve({ values, integrity, usage });
    },
  };
}

describe("translate: budget crossed by a failed request", () => {
  it("marks the run exceeded under warn when the last request fails past the ceiling", async () => {
    const dir = await project(keyedSource(4), { de: undefined });
    const provider = failingOnCall(2, { inputTokens: 6, outputTokens: 4 });

    const summary = await translate(
      {
        config: cfg({ maxBatchSize: 2, maxTokens: 11, budgetBehavior: "warn" }),
        cwd: dir,
      },
      { createProvider: () => provider },
    );

    expect(summary.budget?.exceeded).toBe(true);
    expect(summary.budget?.tokensUsed).toBeGreaterThanOrEqual(11);
    expect(summary.locales[0]?.budgetWithheld).toEqual([]);
    const notice = summary.locales[0]?.notices.find((n) => n.code === "BUDGET_TOKENS_EXCEEDED");
    expect(notice?.message).toContain("reached the configured budget of 11 tokens");
  });

  it("stops the run under stop when a failed request lands exactly on the ceiling", async () => {
    const calibrationDir = await project(keyedSource(2), { de: undefined });
    const calibration = await translate(
      { config: cfg({ maxTokens: 1_000_000, budgetBehavior: "warn" }), cwd: calibrationDir },
      { createProvider: () => failingOnCall(1, USAGE_100) },
    );
    const projected = calibration.budget?.tokensUsed ?? 0;
    expect(projected).toBeGreaterThan(0);

    const dir = await project(keyedSource(2), { de: undefined, fr: undefined });
    const stub = makeStubProvider({ throwForLocales: new Set(["de"]) });

    const summary = await translate(
      {
        config: cfg({
          targetLocales: ["de", "fr"],
          maxTokens: projected,
          budgetBehavior: "stop",
        }),
        cwd: dir,
      },
      { createProvider: () => stub.provider },
    );

    expect(stub.calls.map((c) => c.request.targetLocale)).toEqual(["de"]);
    expect(summary.budget?.exceeded).toBe(true);
    expect(summary.budget?.tokensUsed).toBe(projected);
    const deNotice = summary.locales
      .find((l) => l.locale === "de")
      ?.notices.find((n) => n.code === "BUDGET_TOKENS_EXCEEDED");
    const frNotice = summary.locales
      .find((l) => l.locale === "fr")
      ?.notices.find((n) => n.code === "BUDGET_TOKENS_EXCEEDED");
    expect(deNotice?.message).toContain(`reached the configured budget of ${projected} tokens`);
    expect(frNotice?.message).toContain("had already reached");
    expect(
      [...(summary.locales.find((l) => l.locale === "fr")?.budgetWithheld ?? [])].sort(),
    ).toEqual(["k0", "k1"]);
  });
});

describe("translate: a provider reporting odd numbers", () => {
  it("leaves a readable run-status file when the provider reports fractional usage", async () => {
    const dir = await project(keyedSource(2), { de: undefined });
    const stub = makeStubProvider({ usage: { inputTokens: 10.5, outputTokens: 4.4 } });

    const summary = await translate(
      { config: cfg({ maxTokens: 1000 }), cwd: dir },
      { createProvider: () => stub.provider },
    );

    expect(Number.isInteger(summary.budget?.tokensUsed ?? 0)).toBe(true);
    expect(summary.budget?.tokensUsed).toBe(15);
    expect(summary.usage).toEqual({ inputTokens: 11, outputTokens: 4 });

    const status = await runStatus({ cwd: dir });
    expect(status.available).toBe(true);
    if (status.available) {
      expect(status.budget?.tokensUsed).toBe(15);
    }
  });

  it("never publishes a negative total when the provider reports a negative field", async () => {
    const dir = await project(keyedSource(2), { de: undefined });
    const stub = makeStubProvider({ usage: { inputTokens: 100, outputTokens: -60 } });

    const summary = await translate(
      { config: cfg({ maxTokens: 1000 }), cwd: dir },
      { createProvider: () => stub.provider },
    );

    expect(summary.budget?.tokensUsed).toBe(100);
    expect(summary.usage).toEqual({ inputTokens: 100, outputTokens: 0 });

    const status = await runStatus({ cwd: dir });
    expect(status.available).toBe(true);
  });
});

describe("translate: budget-withheld keys retry next run", () => {
  it("keeps a withheld changed key's prior lock hash, then translates it once the budget allows", async () => {
    const dir = await project(keyedSource(1), { de: undefined, fr: { k0: "[fr] v0" } });

    const stub0 = makeStubProvider();
    await translate(
      { config: cfg({ targetLocales: ["fr"] }), cwd: dir },
      { createProvider: () => stub0.provider },
    );
    const baselineHash = (await readLock(dir)).fr?.k0;
    expect(baselineHash).toBeDefined();

    await writeFile(
      join(dir, "locales", "en.json"),
      `${JSON.stringify({ k0: "v0-changed" }, null, 2)}\n`,
      "utf8",
    );

    const stub1 = makeStubProvider({ usage: USAGE_100 });
    const run1 = await translate(
      {
        config: cfg({ targetLocales: ["de", "fr"], maxTokens: 50, budgetBehavior: "stop" }),
        cwd: dir,
      },
      { createProvider: () => stub1.provider },
    );

    const fr1 = run1.locales.find((l) => l.locale === "fr");
    expect(fr1?.budgetWithheld).toEqual(["k0"]);
    expect((await readLock(dir)).fr?.k0).toBe(baselineHash);
    const frFileAfterRun1 = (await readJsonFile(targetPath(dir, "fr"))) as Record<string, string>;
    expect(frFileAfterRun1.k0).toBe("[fr] v0");

    const stub2 = makeStubProvider();
    const run2 = await translate(
      { config: cfg({ targetLocales: ["de", "fr"] }), cwd: dir },
      { createProvider: () => stub2.provider },
    );

    const fr2 = run2.locales.find((l) => l.locale === "fr");
    expect(fr2?.translated).toEqual(["k0"]);
    const frFileAfterRun2 = (await readJsonFile(targetPath(dir, "fr"))) as Record<string, string>;
    expect(frFileAfterRun2.k0).toBe("[fr] v0-changed");
    expect((await readLock(dir)).fr?.k0).not.toBe(baselineHash);
  });
});

describe("translate: token-less provider with a configured budget", () => {
  it("counts an estimate instead of nothing, and withholds once the estimate crosses", async () => {
    const dir = await project(keyedSource(6), { de: undefined });
    const stub = makeStubProvider({ kind: "machine-translation" });

    const summary = await translate(
      { config: cfg({ maxBatchSize: 2, maxTokens: 1000, budgetBehavior: "stop" }), cwd: dir },
      { createProvider: () => stub.provider },
    );

    expect(stub.calls).toHaveLength(2);
    expect(summary.budget).toEqual({
      maxTokens: 1000,
      behavior: "stop",
      supported: false,
      tokensUsed: 788,
      exceeded: true,
    });
    expect(summary.usage).toBeUndefined();
    expect([...(summary.locales[0]?.budgetWithheld ?? [])].sort()).toEqual(["k4", "k5"]);
    expect(summary.locales[0]?.notices.map((n) => n.code)).toContain("BUDGET_TOKENS_EXCEEDED");
  });

  it("withholds nothing from a token-less provider under the warn default, but still counts it", async () => {
    const dir = await project(keyedSource(6), { de: undefined });
    const stub = makeStubProvider({ kind: "machine-translation" });

    const summary = await translate(
      { config: cfg({ maxBatchSize: 2, maxTokens: 1 }), cwd: dir },
      { createProvider: () => stub.provider },
    );

    expect(stub.calls).toHaveLength(3);
    expect(summary.budget?.behavior).toBe("warn");
    expect(summary.budget?.tokensUsed).toBeGreaterThan(0);
    expect(summary.budget?.exceeded).toBe(true);
    expect(summary.locales.flatMap((l) => l.budgetWithheld)).toEqual([]);
    expect([...(summary.locales[0]?.translated ?? [])].sort()).toEqual([
      "k0",
      "k1",
      "k2",
      "k3",
      "k4",
      "k5",
    ]);
  });

  it("stays inert for a dry-run with maxTokens set, since the provider is never called", async () => {
    const dir = await project(keyedSource(2), { de: undefined });

    const summary = await translate({ config: cfg({ maxTokens: 1 }), cwd: dir, dryRun: true });

    expect(summary.budget).toEqual({
      maxTokens: 1,
      behavior: "warn",
      supported: false,
      tokensUsed: 0,
      exceeded: false,
    });
    expect(summary.usage).toBeUndefined();
  });
});
