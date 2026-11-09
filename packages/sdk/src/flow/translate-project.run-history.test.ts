import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { VerbatraConfig } from "../config/schema.js";
import { defaultFs, type SdkFs } from "../fs.js";
import { readRunHistoryFile, runHistoryFilePath } from "../run-history/run-history-file.js";
import { baseConfig, makeStubProvider, makeTempDir } from "../test-support.js";
import { check } from "./check.js";
import { runHistory } from "./run-history.js";
import { translate } from "./translate-project.js";

const RATES = {
  asOf: "2026-11-01",
  currency: "USD",
  table: { "anthropic/test-model": { inputPerMillionTokens: 3, outputPerMillionTokens: 15 } },
};

const cfg = (overrides: Partial<VerbatraConfig> = {}): VerbatraConfig =>
  baseConfig({ targetLocales: ["de", "fr"], ...overrides });

async function project(source: Record<string, string>): Promise<string> {
  const dir = await makeTempDir();
  await mkdir(join(dir, "locales"));
  await writeFile(join(dir, "locales", "en.json"), `${JSON.stringify(source)}\n`, "utf8");
  return dir;
}

function amountOf(record: { readonly cost: { readonly pricing: string } } | undefined): number {
  const cost = record?.cost;
  return cost !== undefined && "amount" in cost ? Number(cost.amount) : Number.NaN;
}

async function historyOf(dir: string) {
  return (await readRunHistoryFile(runHistoryFilePath(dir), defaultFs)).records;
}

describe("translate: run history", () => {
  it("adds exactly one record for a real run, with usage, frozen cost and coverage", async () => {
    const dir = await project({ greeting: "Hello", farewell: "Goodbye" });
    const stub = makeStubProvider({ usage: { inputTokens: 1000, outputTokens: 500 } });

    await translate(
      { config: cfg({ rates: RATES }), cwd: dir },
      { createProvider: () => stub.provider },
    );

    const records = await historyOf(dir);
    expect(records).toHaveLength(1);
    const [record] = records;
    expect(record).toMatchObject({
      trigger: "translate",
      provider: "anthropic",
      model: "test-model",
    });
    expect(record?.usage).toEqual({ inputTokens: 2000, outputTokens: 1000 });
    expect(record?.cost).toMatchObject({
      pricing: "priced",
      basis: "usage",
      currency: "USD",
      asOf: "2026-11-01",
    });
    expect(amountOf(record)).toBeCloseTo((2000 * 3 + 1000 * 15) / 1_000_000, 12);
    expect(record?.locales.map((entry) => entry.locale)).toEqual(["de", "fr"]);
    expect(record?.locales[0]).toMatchObject({ translated: 2, status: "succeeded" });
  });

  it("records coverage equal to a direct check over the same locales", async () => {
    const dir = await project({ greeting: "Hello", farewell: "Goodbye" });
    const stub = makeStubProvider({ failIntegrity: new Set(["farewell"]) });

    await translate({ config: cfg(), cwd: dir }, { createProvider: () => stub.provider });

    const [record] = await historyOf(dir);
    const direct = await check({ config: cfg(), cwd: dir, locales: ["de", "fr"] });
    expect(record?.locales.map((entry) => entry.coverage)).toEqual(
      direct.locales.map((entry) => ({
        missing: entry.missing,
        stale: entry.stale,
        upToDate: entry.upToDate,
      })),
    );
    expect(record?.locales[0]?.coverage?.missing).toBeGreaterThan(0);
  });

  it("holds coverage only for the locales the run touched", async () => {
    const dir = await project({ greeting: "Hello" });
    const stub = makeStubProvider();
    await translate({ config: cfg(), cwd: dir }, { createProvider: () => stub.provider });
    await writeFile(join(dir, "locales", "en.json"), `${JSON.stringify({ greeting: "Hi" })}\n`);

    await translate(
      { config: cfg(), cwd: dir, locales: ["de"] },
      { createProvider: () => stub.provider },
    );

    const records = await historyOf(dir);
    expect(records).toHaveLength(2);
    expect(records[1]?.locales.map((entry) => entry.locale)).toEqual(["de"]);
  });

  it("serializes no key name and no text into the line", async () => {
    const dir = await project({ secretKeyName: "Confidential sentence", other: "More text" });
    const stub = makeStubProvider();

    await translate({ config: cfg(), cwd: dir }, { createProvider: () => stub.provider });

    const text = await readFile(runHistoryFilePath(dir), "utf8");
    for (const forbidden of ["secretKeyName", "Confidential", "other", "More text", "[de]"]) {
      expect(text).not.toContain(forbidden);
    }
  });

  it("records nothing for a dry run", async () => {
    const dir = await project({ greeting: "Hello" });
    const stub = makeStubProvider();

    await translate(
      { config: cfg(), cwd: dir, dryRun: true },
      { createProvider: () => stub.provider },
    );

    await expect(stat(runHistoryFilePath(dir))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("records nothing for a no-op cycle, 200 times over", async () => {
    const dir = await project({ greeting: "Hello" });
    const stub = makeStubProvider();
    await translate({ config: cfg(), cwd: dir }, { createProvider: () => stub.provider });
    const before = await readFile(runHistoryFilePath(dir), "utf8");

    for (let cycle = 0; cycle < 200; cycle += 1) {
      await translate({ config: cfg(), cwd: dir }, { createProvider: () => stub.provider });
    }

    expect(await readFile(runHistoryFilePath(dir), "utf8")).toBe(before);
  });

  it("still records a run that only served keys from the translation memory", async () => {
    const dir = await project({ greeting: "Hello" });
    const stub = makeStubProvider({ usage: { inputTokens: 10, outputTokens: 5 } });
    await translate({ config: cfg(), cwd: dir }, { createProvider: () => stub.provider });
    await rm(join(dir, "locales", "de.json"));
    await rm(join(dir, "locales", "fr.json"));
    await rm(join(dir, "verbatra.lock.json"));
    const callsBefore = stub.calls.length;

    await translate({ config: cfg(), cwd: dir }, { createProvider: () => stub.provider });

    expect(stub.calls).toHaveLength(callsBefore);
    const records = await historyOf(dir);
    expect(records).toHaveLength(2);
    expect(records[1]?.usage).toBeUndefined();
    expect(records[1]?.locales[0]).toMatchObject({ cacheHits: 1, translated: 0 });
  });

  it("records a run that was refused by the integrity gate", async () => {
    const dir = await project({ greeting: "Hello" });
    const stub = makeStubProvider({ failIntegrity: new Set(["greeting"]) });

    await translate({ config: cfg(), cwd: dir }, { createProvider: () => stub.provider });

    const [record] = await historyOf(dir);
    expect(record?.locales[0]).toMatchObject({ integrityMismatches: 1, status: "failed" });
  });

  it("prices a character-billed run by the source characters it sent, refused keys included, cache hits excluded", async () => {
    const dir = await project({ greeting: "Hello", farewell: "Goodbye" });
    const config = cfg({
      targetLocales: ["de"],
      provider: { id: "deepl", options: {} },
      rates: {
        asOf: "2026-11-01",
        currency: "EUR",
        table: { deepl: { perMillionCharacters: 20 } },
      },
    });
    const stub = makeStubProvider({
      id: "deepl",
      kind: "machine-translation",
      failIntegrity: new Set(["farewell"]),
    });

    await translate({ config, cwd: dir }, { createProvider: () => stub.provider });

    const [record] = await historyOf(dir);
    expect(record?.cost).toMatchObject({
      pricing: "priced",
      basis: "source-characters",
      currency: "EUR",
      caveats: ["SOURCE_DUPLICATES_NOT_DEDUPLICATED", "TRANSPORT_RETRIES_NOT_COUNTED"],
    });
    expect(amountOf(record)).toBeCloseTo(
      (("Hello".length + "Goodbye".length) * 20) / 1_000_000,
      12,
    );

    await rm(join(dir, "locales", "de.json"));
    await rm(join(dir, "verbatra.lock.json"));
    const second = makeStubProvider({ id: "deepl", kind: "machine-translation" });
    await translate({ config, cwd: dir }, { createProvider: () => second.provider });
    const records = await historyOf(dir);
    expect(amountOf(records[1])).toBeCloseTo(("Goodbye".length * 20) / 1_000_000, 12);
  });

  it("keeps both records when two runs finish together", async () => {
    const dir = await project({ greeting: "Hello" });
    const stub = makeStubProvider();

    await Promise.all([
      translate(
        { config: cfg(), cwd: dir, locales: ["de"] },
        { createProvider: () => stub.provider },
      ),
      translate(
        { config: cfg(), cwd: dir, locales: ["fr"] },
        { createProvider: () => stub.provider },
      ),
    ]);

    const records = await historyOf(dir);
    expect(records).toHaveLength(2);
    expect(records.flatMap((record) => record.locales.map((entry) => entry.locale)).sort()).toEqual(
      ["de", "fr"],
    );
  });

  it("does not fail or stall a finished run when the lock-file guard stays held", async () => {
    const dir = await project({ greeting: "Hello" });
    let armed = false;
    const fs: SdkFs = {
      ...defaultFs,
      createExclusive: (path, data) =>
        armed && path.endsWith("_lockfile.lock")
          ? Promise.resolve(false)
          : defaultFs.createExclusive(path, data),
    };
    const stub = makeStubProvider();
    const started = Date.now();

    const summary = await translate(
      {
        config: cfg(),
        cwd: dir,
        onProgress: (event) => {
          if (event.type === "run-finished") {
            armed = true;
          }
        },
      },
      { createProvider: () => stub.provider, fs },
    );

    expect(summary.succeeded).toEqual(["de", "fr"]);
    expect(Date.now() - started).toBeLessThan(8000);
    await expect(stat(runHistoryFilePath(dir))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("reads back through runHistory, newest first", async () => {
    const dir = await project({ greeting: "Hello" });
    const stub = makeStubProvider();
    await translate(
      { config: cfg(), cwd: dir, locales: ["de"] },
      { createProvider: () => stub.provider },
    );
    await translate(
      { config: cfg(), cwd: dir, locales: ["fr"] },
      { createProvider: () => stub.provider },
    );

    const result = await runHistory({ cwd: dir });

    expect(result.total).toBe(2);
    expect(result.records[0]?.locales[0]?.locale).toBe("fr");
  });
});
