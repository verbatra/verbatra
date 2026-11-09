import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ProviderError, type TranslationProvider } from "@verbatra/ai-providers";
import { describe, expect, it } from "vitest";
import type { VerbatraConfig } from "../config/schema.js";
import { defaultFs } from "../fs.js";
import { readRunHistoryFile, runHistoryFilePath } from "../run-history/run-history-file.js";
import { baseConfig, makeStubProvider, makeTempDir } from "../test-support.js";
import { BatchInterruptedError, retranslateEntries } from "./entry-batch.js";
import { retranslateEntry } from "./retranslate-entry.js";

const RATES = {
  asOf: "2026-11-01",
  currency: "USD",
  table: { "anthropic/test-model": { inputPerMillionTokens: 3, outputPerMillionTokens: 15 } },
};

const cfg = (overrides: Partial<VerbatraConfig> = {}): VerbatraConfig =>
  baseConfig({ targetLocales: ["de", "fr"], rates: RATES, ...overrides });

async function project(source: Record<string, string>): Promise<string> {
  const dir = await makeTempDir();
  await mkdir(join(dir, "locales"));
  await writeFile(join(dir, "locales", "en.json"), `${JSON.stringify(source)}\n`, "utf8");
  return dir;
}

async function historyOf(dir: string) {
  return (await readRunHistoryFile(runHistoryFilePath(dir), defaultFs)).records;
}

describe("retranslateEntry: run history", () => {
  it("records one retranslate record with usage and frozen cost", async () => {
    const dir = await project({ greeting: "Hello" });
    const stub = makeStubProvider({ usage: { inputTokens: 100, outputTokens: 40 } });

    await retranslateEntry(
      { config: cfg(), cwd: dir, locale: "de", key: "greeting" },
      { createProvider: () => stub.provider },
    );

    const records = await historyOf(dir);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      trigger: "retranslate",
      entries: 1,
      usage: { inputTokens: 100, outputTokens: 40 },
      cost: { pricing: "priced", basis: "usage", currency: "USD" },
    });
    expect(records[0]?.locales).toHaveLength(1);
    expect(records[0]?.locales[0]).toMatchObject({
      locale: "de",
      status: "succeeded",
      translated: 1,
      coverage: { missing: 0, stale: 0, upToDate: 1 },
    });
  });

  it("records the usage of a refused retranslation, which spent tokens", async () => {
    const dir = await project({ greeting: "Hello" });
    const stub = makeStubProvider({
      translate: () => "",
      usage: { inputTokens: 7, outputTokens: 3 },
    });

    await retranslateEntry(
      { config: cfg(), cwd: dir, locale: "de", key: "greeting" },
      { createProvider: () => stub.provider },
    );

    const [record] = await historyOf(dir);
    expect(record?.usage).toEqual({ inputTokens: 7, outputTokens: 3 });
    expect(record?.locales[0]).toMatchObject({
      status: "failed",
      integrityMismatches: 1,
      translated: 0,
    });
  });

  it("records the usage of an answer that then failed the call, and rethrows the error", async () => {
    const dir = await project({ greeting: "Hello" });
    const stub = makeStubProvider({
      missingValues: new Set(["greeting"]),
      usage: { inputTokens: 9, outputTokens: 1 },
    });

    await expect(
      retranslateEntry(
        { config: cfg(), cwd: dir, locale: "de", key: "greeting" },
        { createProvider: () => stub.provider },
      ),
    ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });

    const [record] = await historyOf(dir);
    expect(record?.usage).toEqual({ inputTokens: 9, outputTokens: 1 });
    expect(record?.locales[0]).toMatchObject({ providerFailures: 1, status: "failed" });
  });

  it("records a call that failed at the provider as a provider failure, with unknown cost", async () => {
    const dir = await project({ greeting: "Hello" });
    const stub = makeStubProvider({ throwForLocales: new Set(["de"]) });

    await expect(
      retranslateEntry(
        { config: cfg(), cwd: dir, locale: "de", key: "greeting" },
        { createProvider: () => stub.provider },
      ),
    ).rejects.toThrow("stub provider failure");

    const [record] = await historyOf(dir);
    expect(record).toMatchObject({
      trigger: "retranslate",
      entries: 1,
      cost: { pricing: "no-usage", basis: "usage" },
    });
    expect(record?.usage).toBeUndefined();
    expect(record?.locales[0]).toMatchObject({
      status: "failed",
      providerFailures: 1,
      translated: 0,
    });
  });

  it("marks a batch as a lower bound when an attempted entry reported no usage", async () => {
    const dir = await project({ a: "A", b: "B" });
    const inner = makeStubProvider({ usage: { inputTokens: 1_000_000, outputTokens: 0 } });
    const provider: TranslationProvider = {
      ...inner.provider,
      translateBatch: (request) =>
        request.targetLocale === "fr"
          ? Promise.reject(new ProviderError("INVALID_RESPONSE", "no value"))
          : inner.provider.translateBatch(request),
    };

    await retranslateEntries(
      {
        config: cfg(),
        cwd: dir,
        entries: [
          { locale: "de", key: "a" },
          { locale: "fr", key: "b" },
        ],
      },
      { createProvider: () => provider },
    );

    const [record] = await historyOf(dir);
    expect(record?.cost).toMatchObject({ pricing: "priced", caveats: ["USAGE_PARTIAL"] });
  });

  it("counts a failed entry in a batch as attempted and as a provider failure", async () => {
    const dir = await project({ a: "A", b: "B" });
    const stub = makeStubProvider({
      throwForLocales: new Set(["fr"]),
      error: new ProviderError("INVALID_RESPONSE", "no value"),
    });

    await retranslateEntries(
      {
        config: cfg(),
        cwd: dir,
        entries: [
          { locale: "de", key: "a" },
          { locale: "fr", key: "b" },
        ],
      },
      { createProvider: () => stub.provider },
    );

    const [record] = await historyOf(dir);
    expect(record?.entries).toBe(2);
    expect(record?.locales.map((entry) => [entry.locale, entry.providerFailures])).toEqual([
      ["de", 0],
      ["fr", 1],
    ]);
  });

  it("records nothing for a call refused before the provider is reached", async () => {
    const dir = await project({ greeting: "Hello" });
    const stub = makeStubProvider();

    await expect(
      retranslateEntry(
        { config: cfg(), cwd: dir, locale: "de", key: "missing" },
        { createProvider: () => stub.provider },
      ),
    ).rejects.toMatchObject({ code: "UNKNOWN_KEY" });

    expect(await historyOf(dir)).toEqual([]);
  });

  it("prices a character-billed retranslation by the source characters sent", async () => {
    const dir = await project({ greeting: "Hello" });
    const config = cfg({
      provider: { id: "deepl", options: {} },
      rates: {
        asOf: "2026-11-01",
        currency: "EUR",
        table: { deepl: { perMillionCharacters: 20 } },
      },
    });
    const stub = makeStubProvider({ id: "deepl", kind: "machine-translation" });

    await retranslateEntry(
      { config, cwd: dir, locale: "de", key: "greeting" },
      { createProvider: () => stub.provider },
    );

    const [record] = await historyOf(dir);
    expect(record?.cost).toMatchObject({ pricing: "priced", basis: "source-characters" });
    const cost = record?.cost;
    expect(cost !== undefined && "amount" in cost ? cost.amount : Number.NaN).toBeCloseTo(
      (5 * 20) / 1_000_000,
      12,
    );
  });

  it("writes no key name and no text", async () => {
    const dir = await project({ secretKeyName: "Confidential sentence" });
    const stub = makeStubProvider();

    await retranslateEntry(
      { config: cfg(), cwd: dir, locale: "de", key: "secretKeyName" },
      { createProvider: () => stub.provider },
    );

    const text = await readFile(runHistoryFilePath(dir), "utf8");
    for (const forbidden of ["secretKeyName", "Confidential", "[de]"]) {
      expect(text).not.toContain(forbidden);
    }
  });
});

describe("retranslateEntries: run history", () => {
  it("writes one record for a batch of 20, summing usage and counting entries", async () => {
    const source = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`k${i}`, `v${i}`]));
    const dir = await project(source);
    const stub = makeStubProvider({ usage: { inputTokens: 10, outputTokens: 5 } });

    await retranslateEntries(
      {
        config: cfg(),
        cwd: dir,
        entries: Object.keys(source).map((key, index) => ({
          locale: index % 2 === 0 ? "de" : "fr",
          key,
        })),
      },
      { createProvider: () => stub.provider },
    );

    const records = await historyOf(dir);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      trigger: "retranslate",
      entries: 20,
      usage: { inputTokens: 200, outputTokens: 100 },
    });
    expect(records[0]?.locales.map((entry) => [entry.locale, entry.translated])).toEqual([
      ["de", 10],
      ["fr", 10],
    ]);
  });

  it("marks a locale partial when only some of its entries landed", async () => {
    const dir = await project({ a: "A", b: "B" });
    const stub = makeStubProvider({ failIntegrity: new Set(["b"]) });

    await retranslateEntries(
      {
        config: cfg(),
        cwd: dir,
        entries: [
          { locale: "de", key: "a" },
          { locale: "de", key: "b" },
        ],
      },
      { createProvider: () => stub.provider },
    );

    const [record] = await historyOf(dir);
    expect(record?.locales[0]).toMatchObject({
      status: "partial",
      translated: 1,
      integrityMismatches: 1,
    });
  });

  it("records nothing when no entry reached the provider", async () => {
    const dir = await project({ a: "A" });
    const stub = makeStubProvider();

    await retranslateEntries(
      { config: cfg(), cwd: dir, entries: [{ locale: "de", key: "nope" }] },
      { createProvider: () => stub.provider },
    );

    expect(await historyOf(dir)).toEqual([]);
  });

  it("still records what finished before an interruption, then rethrows", async () => {
    const dir = await project({ a: "A", b: "B", c: "C" });
    const inner = makeStubProvider({ usage: { inputTokens: 10, outputTokens: 5 } });
    let calls = 0;
    const provider: TranslationProvider = {
      ...inner.provider,
      translateBatch: (request) => {
        calls += 1;
        return calls === 3
          ? Promise.reject(new TypeError("unexpected failure"))
          : inner.provider.translateBatch(request);
      },
    };

    const failure = await retranslateEntries(
      {
        config: cfg(),
        cwd: dir,
        entries: [
          { locale: "de", key: "a" },
          { locale: "de", key: "b" },
          { locale: "de", key: "c" },
        ],
      },
      { createProvider: () => provider },
    ).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(BatchInterruptedError);
    const records = await historyOf(dir);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      entries: 3,
      usage: { inputTokens: 20, outputTokens: 10 },
    });
    expect(records[0]?.locales[0]).toMatchObject({ translated: 2, providerFailures: 1 });
  });
});
