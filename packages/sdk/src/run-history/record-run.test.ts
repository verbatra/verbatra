import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ProviderConfig } from "../config/provider-config.js";
import type { RateCard } from "../config/rate-card.js";
import { check } from "../flow/check.js";
import { priceRun, sourceCharactersOfRun } from "../flow/estimate.js";
import type { LocaleSummary, RunSummary } from "../flow/summary.js";
import { defaultFs, type SdkFs } from "../fs.js";
import { baseConfig, makeTempDir } from "../test-support.js";
import {
  draftFromSummary,
  type RunDraft,
  recordRunHistory,
  runLeavesNoTrace,
} from "./record-run.js";
import { readRunHistoryFile, runHistoryFilePath } from "./run-history-file.js";

const ANTHROPIC: ProviderConfig = {
  id: "anthropic",
  options: { model: "test-model", maxTokens: 256 },
};
const DEEPL: ProviderConfig = { id: "deepl", options: {} };

const TOKEN_CARD: RateCard = {
  asOf: "2026-11-01",
  currency: "USD",
  table: { "anthropic/test-model": { inputPerMillionTokens: 3, outputPerMillionTokens: 15 } },
};
const CHAR_CARD: RateCard = {
  asOf: "2026-11-01",
  currency: "EUR",
  table: { deepl: { perMillionCharacters: 20 } },
};

describe("priceRun", () => {
  it("prices token usage at the rate on file and names the basis", () => {
    const cost = priceRun({
      provider: ANTHROPIC,
      rates: TOKEN_CARD,
      usage: { inputTokens: 1_000_000, outputTokens: 2_000_000 },
      sourceCharacters: 99,
    });

    expect(cost).toEqual({
      pricing: "priced",
      basis: "usage",
      rateKey: "anthropic/test-model",
      currency: "USD",
      asOf: "2026-11-01",
      amount: 33,
    });
  });

  it("prices a token run that reported no usage as zero", () => {
    const cost = priceRun({ provider: ANTHROPIC, rates: TOKEN_CARD, sourceCharacters: 0 });

    expect(cost).toMatchObject({ pricing: "priced", amount: 0 });
  });

  it("prices a machine-translation run by source characters, with the estimate's caveats", () => {
    const cost = priceRun({ provider: DEEPL, rates: CHAR_CARD, sourceCharacters: 500_000 });

    expect(cost).toEqual({
      pricing: "priced",
      basis: "source-characters",
      rateKey: "deepl",
      currency: "EUR",
      asOf: "2026-11-01",
      amount: 10,
      caveats: ["SOURCE_DUPLICATES_NOT_DEDUPLICATED", "TRANSPORT_RETRIES_NOT_COUNTED"],
    });
  });

  it("says no rate when the card has none for the provider, with the basis still present", () => {
    expect(priceRun({ provider: ANTHROPIC, sourceCharacters: 0 })).toEqual({
      pricing: "no-rate-on-file",
      basis: "usage",
      rateKey: "anthropic/test-model",
    });
    expect(priceRun({ provider: DEEPL, rates: TOKEN_CARD, sourceCharacters: 1 })).toMatchObject({
      pricing: "no-rate-on-file",
      basis: "source-characters",
    });
  });

  it("refuses a rate written in the wrong unit", () => {
    const wrong: RateCard = {
      ...TOKEN_CARD,
      table: { "anthropic/test-model": { perMillionCharacters: 1 } },
    };

    expect(priceRun({ provider: ANTHROPIC, rates: wrong, sourceCharacters: 0 })).toMatchObject({
      pricing: "rate-unit-mismatch",
      basis: "usage",
    });
  });

  it.each([
    [
      "openai-compatible",
      { id: "openai-compatible", options: { model: "m", baseUrl: "http://x" } },
    ],
    ["libretranslate", { id: "libretranslate", options: { baseUrl: "http://x" } }],
    ["none", { id: "none", options: {} }],
  ] as const)("reports %s as not billed whatever the card says", (_id, provider) => {
    const card: RateCard = { asOf: "2026-11-01", currency: "USD", table: {} };

    const cost = priceRun({
      provider: provider as ProviderConfig,
      rates: card,
      sourceCharacters: 9,
    });

    expect(cost.pricing).toBe("not-billed");
    expect(cost).not.toHaveProperty("amount");
  });

  it.each([
    ["infinite", Number.POSITIVE_INFINITY],
    ["negative", -1],
    ["not a number", Number.NaN],
  ])("treats a %s rate as no usable rate", (_label, bad) => {
    const card: RateCard = {
      ...TOKEN_CARD,
      table: { "anthropic/test-model": { inputPerMillionTokens: bad, outputPerMillionTokens: 1 } },
    };

    const cost = priceRun({
      provider: ANTHROPIC,
      rates: card,
      usage: { inputTokens: 5, outputTokens: 5 },
      sourceCharacters: 0,
    });

    expect(cost.pricing).toBe("no-rate-on-file");
  });

  it("keeps a rate of 1e9 finite", () => {
    const card: RateCard = {
      ...TOKEN_CARD,
      table: {
        "anthropic/test-model": { inputPerMillionTokens: 1e9, outputPerMillionTokens: 1e9 },
      },
    };

    const cost = priceRun({
      provider: ANTHROPIC,
      rates: card,
      usage: { inputTokens: Number.MAX_SAFE_INTEGER, outputTokens: Number.MAX_SAFE_INTEGER },
      sourceCharacters: 0,
    });

    expect(cost).toMatchObject({ pricing: "priced" });
    expect(Number.isFinite((cost as { amount: number }).amount)).toBe(true);
  });
});

function localeSummary(overrides: Partial<LocaleSummary> = {}): LocaleSummary {
  return {
    locale: "de",
    status: "succeeded",
    translated: [],
    unchanged: [],
    orphaned: [],
    pruned: [],
    invalidIcuSource: [],
    cacheHits: [],
    fuzzyHits: [],
    integrityMismatches: [],
    providerFailures: [],
    generated: [],
    budgetWithheld: [],
    sensitiveWithheld: [],
    notices: [],
    needsReview: [],
    unfilled: [],
    protected: [],
    malformedRows: [],
    duplicateKeys: [],
    ...overrides,
  };
}

function runSummary(
  locales: readonly LocaleSummary[],
  overrides: Partial<RunSummary> = {},
): RunSummary {
  return {
    dryRun: false,
    locales,
    succeeded: [],
    partial: [],
    failed: [],
    ...overrides,
  };
}

describe("runLeavesNoTrace", () => {
  it("is true for a run where every locale succeeded and changed nothing", () => {
    const quiet = localeSummary({
      unchanged: ["a"],
      orphaned: ["b"],
      unfilled: ["c"],
      emptySource: ["d"],
    });

    expect(runLeavesNoTrace(runSummary([quiet, localeSummary({ locale: "fr" })]))).toBe(true);
  });

  it.each([
    ["translated", { translated: ["a"] }],
    ["cacheHits", { cacheHits: ["a"] }],
    ["fuzzyHits", { fuzzyHits: [{ key: "a", previousSource: "x", similarity: 0.9 }] }],
    ["generated", { generated: ["a_one"] }],
    ["pruned", { pruned: ["a"] }],
    ["integrityMismatches", { integrityMismatches: ["a"] }],
    ["providerFailures", { providerFailures: ["a"] }],
    ["a partial status", { status: "partial" as const }],
    ["a failed status", { status: "failed" as const }],
  ])("is false when a locale has %s", (_label, overrides) => {
    const traced = localeSummary(overrides);

    expect(runLeavesNoTrace(runSummary([localeSummary({ locale: "fr" }), traced]))).toBe(false);
  });

  it("is false when the run reports usage, even with nothing else", () => {
    expect(
      runLeavesNoTrace(
        runSummary([localeSummary()], { usage: { inputTokens: 1, outputTokens: 0 } }),
      ),
    ).toBe(false);
  });
});

describe("draftFromSummary", () => {
  it("keeps only the locales that left a trace and counts, never names", () => {
    const config = baseConfig({ targetLocales: ["de", "fr"] });
    const source = {
      locale: "en",
      namespace: "en",
      format: "i18next-json" as const,
      entries: new Map([
        ["a", { key: "a", namespace: "en", value: "Hello", placeholders: [], isPlural: false }],
        ["b", { key: "b", namespace: "en", value: "Goodbye", placeholders: [], isPlural: false }],
        ["c", { key: "c", namespace: "en", value: "Ignored", placeholders: [], isPlural: false }],
      ]),
    };
    const summary = runSummary([
      localeSummary({
        locale: "de",
        translated: ["a"],
        integrityMismatches: ["b"],
        cacheHits: ["c"],
      }),
      localeSummary({ locale: "fr" }),
    ]);

    const draft = draftFromSummary(summary, source, config);

    expect(draft.locales.map((entry) => entry.locale)).toEqual(["de"]);
    expect(draft.locales[0]).toMatchObject({ translated: 1, integrityMismatches: 1, cacheHits: 1 });
    expect(draft.sourceCharacters).toBe("Hello".length + "Goodbye".length);
  });
});

describe("sourceCharactersOfRun", () => {
  it("counts generated plural forms and withheld generated forms through the plan", () => {
    const config = baseConfig({ targetLocales: ["pl"], format: "i18next-json" });
    const entry = (key: string, value: string) => ({
      key,
      namespace: "en",
      value,
      placeholders: [],
      isPlural: true,
    });
    const source = {
      locale: "en",
      namespace: "en",
      format: "i18next-json" as const,
      entries: new Map([
        ["item_one", entry("item_one", "One item")],
        ["item_other", entry("item_other", "Many items")],
      ]),
    };
    const summary = localeSummary({
      locale: "pl",
      generated: ["item_few"],
      integrityMismatches: ["item_many"],
    });

    const characters = sourceCharactersOfRun(source, config, [summary]);

    expect(characters).toBe("Many items".length * 2);
  });

  it("skips a key that resolves to neither a source entry nor a planned form", () => {
    const config = baseConfig({ targetLocales: ["de"] });
    const source = {
      locale: "en",
      namespace: "en",
      format: "i18next-json" as const,
      entries: new Map(),
    };

    expect(sourceCharactersOfRun(source, config, [localeSummary({ translated: ["ghost"] })])).toBe(
      0,
    );
  });
});

function draft(overrides: Partial<RunDraft> = {}): RunDraft {
  return {
    trigger: "translate",
    locales: [
      {
        locale: "de",
        status: "succeeded",
        translated: 1,
        cacheHits: 0,
        fuzzyHits: 0,
        generated: 0,
        pruned: 0,
        integrityMismatches: 0,
        providerFailures: 0,
        usage: undefined,
      },
    ],
    usage: undefined,
    sourceCharacters: 0,
    ...overrides,
  };
}

describe("recordRunHistory", () => {
  it("flags coverage as unavailable when the coverage pass fails, and still records", async () => {
    const dir = await makeTempDir();

    await recordRunHistory({ config: baseConfig(), cwd: dir, fs: defaultFs }, draft());

    const [record] = (await readRunHistoryFile(runHistoryFilePath(dir), defaultFs)).records;
    expect(record?.coverageUnavailable).toBe(true);
    expect(record?.locales[0]?.coverage).toBeUndefined();
  });

  it("measures coverage for the locales it names, and only those", async () => {
    const dir = await makeTempDir();
    await mkdir(join(dir, "locales"));
    await writeFile(join(dir, "locales", "en.json"), '{"a":"A","b":"B"}\n');
    await writeFile(join(dir, "locales", "de.json"), '{"a":"A"}\n');
    const config = baseConfig({ targetLocales: ["de", "fr"] });

    await recordRunHistory({ config, cwd: dir, fs: defaultFs }, draft());

    const [record] = (await readRunHistoryFile(runHistoryFilePath(dir), defaultFs)).records;
    expect(record?.coverageUnavailable).toBeUndefined();
    expect(record?.locales.map((entry) => entry.locale)).toEqual(["de"]);
    const direct = await check({ config, cwd: dir, locales: ["de"] });
    expect(record?.locales[0]?.coverage).toEqual({
      missing: direct.locales[0]?.missing,
      stale: direct.locales[0]?.stale,
      upToDate: direct.locales[0]?.upToDate,
    });
    expect(record?.locales[0]?.coverage?.missing).toBe(1);
  });

  it("swallows a write failure", async () => {
    const dir = await makeTempDir();
    const fs: SdkFs = { ...defaultFs, writeFile: () => Promise.reject(new Error("disk full")) };

    await expect(
      recordRunHistory({ config: baseConfig(), cwd: dir, fs }, draft()),
    ).resolves.toBeUndefined();
  });

  it("swallows a guard that is never acquired within its timeout", async () => {
    const dir = await makeTempDir();
    const fs: SdkFs = { ...defaultFs, createExclusive: () => Promise.resolve(false) };
    const started = Date.now();

    await recordRunHistory({ config: baseConfig(), cwd: dir, fs, acquireTimeoutMs: 120 }, draft());

    expect(Date.now() - started).toBeLessThan(3000);
  });

  it("records an empty locale list without a coverage pass", async () => {
    const dir = await makeTempDir();

    await recordRunHistory(
      { config: baseConfig(), cwd: dir, fs: defaultFs },
      draft({ locales: [] }),
    );

    const [record] = (await readRunHistoryFile(runHistoryFilePath(dir), defaultFs)).records;
    expect(record?.locales).toEqual([]);
    expect(record?.coverageUnavailable).toBeUndefined();
  });
});
