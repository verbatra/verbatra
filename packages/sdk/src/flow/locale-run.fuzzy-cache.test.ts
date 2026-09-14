import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { TranslateRequest, TranslationProvider } from "@verbatra/ai-providers";
import { contentHash, type LocaleResource } from "@verbatra/core";
import { createDefaultRegistry, type FormatAdapter } from "@verbatra/format-adapters";
import { describe, expect, it } from "vitest";
import type { TranslationMemory } from "../cache/types.js";
import { defaultFs } from "../fs.js";
import { createLocalePathResolver } from "../locale-path/resolver.js";
import { makeTempDir, readJsonFile, writeJsonFile } from "../test-support.js";
import { createBudgetTracker } from "./budget.js";
import { type LocaleRunParams, runLocale } from "./locale-run.js";

const FINGERPRINT = "fp1";

function i18nextAdapter(): FormatAdapter {
  const resolution = createDefaultRegistry().resolve("", { format: "i18next-json" });
  if (resolution.status !== "resolved") {
    throw new Error("i18next adapter did not resolve");
  }
  return resolution.adapter;
}

const adapter = i18nextAdapter();

interface CountingProvider {
  readonly provider: TranslationProvider;
  readonly requests: TranslateRequest[];
}

function countingProvider(prefix = "[de] "): CountingProvider {
  const requests: TranslateRequest[] = [];
  const provider: TranslationProvider = {
    id: "openai-compatible",
    kind: "llm",
    supportsGlossary: false,
    translateBatch: (request) => {
      requests.push(request);
      const values = new Map<string, string>();
      for (const entry of request.entries) {
        values.set(entry.key, `${prefix}${entry.value}`);
      }
      return Promise.resolve({ values, integrity: new Map() });
    },
  };
  return { provider, requests };
}

async function setup(
  source: Record<string, unknown>,
): Promise<{ dir: string; sourceResource: LocaleResource }> {
  const dir = await makeTempDir();
  await mkdir(join(dir, "locales"));
  await writeJsonFile(join(dir, "locales", "en.json"), source);
  const sourceResource = (await adapter.read(join(dir, "locales", "en.json"), "en")).resource;
  return { dir, sourceResource };
}

function memoryFor(previousSource: string, translation: string): TranslationMemory {
  const hash = contentHash({
    key: "seed",
    namespace: "",
    value: previousSource,
    placeholders: adapter.extractPlaceholders(previousSource),
    isPlural: false,
  });
  return {
    version: 2,
    entries: { [FINGERPRINT]: { de: { [hash]: translation } } },
    sources: { [hash]: previousSource },
  };
}

function makeParams(
  base: { source: LocaleResource; cwd: string },
  overrides: Partial<LocaleRunParams> = {},
): LocaleRunParams {
  return {
    source: base.source,
    sourceInvalidIcuKeys: [],
    baseline: new Map(),
    adapter,
    provider: countingProvider().provider,
    providerKind: "llm",
    cwd: base.cwd,
    resolver: createLocalePathResolver(base.cwd, {
      sourceLocale: "en",
      targetLocales: ["de"],
      format: "i18next-json",
      files: { pattern: "locales/{locale}.json" },
    }),
    sourceLocale: "en",
    targetLocale: "de",
    format: "i18next-json",
    glossary: undefined,
    tone: undefined,
    prune: false,
    generatePlurals: false,
    maxBatchSize: 50,
    fs: defaultFs,
    budget: createBudgetTracker(undefined, "warn"),
    ...overrides,
  };
}

const OLD_SENTENCE = "Your subscription renews automatically at the end of each billing period.";
const EDITED_SENTENCE = OLD_SENTENCE.replace("period.", "period!");
const GERMAN = "Dein Abo verlangert sich am Ende jedes Abrechnungszeitraums automatisch.";

describe("runLocale: fuzzy cache reuse", () => {
  it("serves an edited string from the cache without calling the provider", async () => {
    const { dir, sourceResource } = await setup({ billing: EDITED_SENTENCE });
    const stub = countingProvider();

    const result = await runLocale(
      makeParams(
        { source: sourceResource, cwd: dir },
        {
          provider: stub.provider,
          cache: {
            snapshot: memoryFor(OLD_SENTENCE, GERMAN),
            fingerprint: FINGERPRINT,
            fuzzy: { threshold: 0.9 },
          },
        },
      ),
    );

    expect(stub.requests).toHaveLength(0);
    expect(result.summary.translated).toEqual([]);
    const written = (await readJsonFile(join(dir, "locales", "de.json"))) as Record<string, string>;
    expect(written.billing).toBe(GERMAN);
  });

  it("reports a fuzzy hit in its own bucket rather than as an exact cache hit", async () => {
    const { dir, sourceResource } = await setup({ billing: EDITED_SENTENCE });

    const result = await runLocale(
      makeParams(
        { source: sourceResource, cwd: dir },
        {
          cache: {
            snapshot: memoryFor(OLD_SENTENCE, GERMAN),
            fingerprint: FINGERPRINT,
            fuzzy: { threshold: 0.9 },
          },
        },
      ),
    );

    expect(result.summary.cacheHits).toEqual([]);
    expect(result.summary.fuzzyHits).toEqual([
      { key: "billing", similarity: expect.any(Number), previousSource: OLD_SENTENCE },
    ]);
    expect(result.summary.fuzzyHits[0]?.similarity).toBeGreaterThan(0.98);
  });

  it("never writes a fuzzy hit back into the cache as a confirmed translation", async () => {
    const { dir, sourceResource } = await setup({ billing: EDITED_SENTENCE });

    const result = await runLocale(
      makeParams(
        { source: sourceResource, cwd: dir },
        {
          cache: {
            snapshot: memoryFor(OLD_SENTENCE, GERMAN),
            fingerprint: FINGERPRINT,
            fuzzy: { threshold: 0.9 },
          },
        },
      ),
    );

    expect(result.cacheAdditions).toEqual([]);
  });

  it("calls the provider when the edit falls below the threshold", async () => {
    const { dir, sourceResource } = await setup({ billing: EDITED_SENTENCE });
    const stub = countingProvider();

    const result = await runLocale(
      makeParams(
        { source: sourceResource, cwd: dir },
        {
          provider: stub.provider,
          cache: {
            snapshot: memoryFor(OLD_SENTENCE, GERMAN),
            fingerprint: FINGERPRINT,
            fuzzy: { threshold: 0.999 },
          },
        },
      ),
    );

    expect(stub.requests).toHaveLength(1);
    expect(result.summary.fuzzyHits).toEqual([]);
    expect(result.summary.translated).toEqual(["billing"]);
  });

  it("calls the provider when fuzzy reuse was not asked for", async () => {
    const { dir, sourceResource } = await setup({ billing: EDITED_SENTENCE });
    const stub = countingProvider();

    const result = await runLocale(
      makeParams(
        { source: sourceResource, cwd: dir },
        {
          provider: stub.provider,
          cache: { snapshot: memoryFor(OLD_SENTENCE, GERMAN), fingerprint: FINGERPRINT },
        },
      ),
    );

    expect(stub.requests).toHaveLength(1);
    expect(result.summary.fuzzyHits).toEqual([]);
  });

  it("refuses a near match whose placeholders no longer fit the edited source", async () => {
    const previous = "Hi {{name}}, your invoice is ready to download";
    const edited = "Hi {{names}}, your invoice is ready to download";
    const { dir, sourceResource } = await setup({ invoice: edited });
    const stub = countingProvider();

    const result = await runLocale(
      makeParams(
        { source: sourceResource, cwd: dir },
        {
          provider: stub.provider,
          cache: {
            snapshot: memoryFor(previous, "Hallo {{name}}, deine Rechnung steht bereit"),
            fingerprint: FINGERPRINT,
            fuzzy: { threshold: 0.9 },
          },
        },
      ),
    );

    expect(result.summary.fuzzyHits).toEqual([]);
    expect(stub.requests).toHaveLength(1);
    expect(result.summary.translated).toEqual(["invoice"]);
  });

  it("would have reused that placeholder-breaking match if only the score decided it", () => {
    const previous = "Hi {{name}}, your invoice is ready to download";
    const edited = "Hi {{names}}, your invoice is ready to download";

    expect(previous).toHaveLength(edited.length - 1);
    expect(adapter.extractPlaceholders(previous)).not.toEqual(adapter.extractPlaceholders(edited));
  });

  it("reports several fuzzy hits in key order, not in the order they were resolved", async () => {
    const otherOld = "Cancel your plan whenever you like, with no notice period to serve first.";
    const otherEdited = otherOld.replace("first.", "first!");
    const { dir, sourceResource } = await setup({ zBilling: EDITED_SENTENCE, aPlan: otherEdited });
    const seeded = memoryFor(OLD_SENTENCE, GERMAN);
    const other = memoryFor(otherOld, "Kuendige jederzeit");

    const result = await runLocale(
      makeParams(
        { source: sourceResource, cwd: dir },
        {
          cache: {
            snapshot: {
              version: 2,
              entries: {
                [FINGERPRINT]: {
                  de: { ...seeded.entries[FINGERPRINT]?.de, ...other.entries[FINGERPRINT]?.de },
                },
              },
              sources: { ...seeded.sources, ...other.sources },
            },
            fingerprint: FINGERPRINT,
            fuzzy: { threshold: 0.9 },
          },
        },
      ),
    );

    expect(result.summary.fuzzyHits.map((hit) => hit.key)).toEqual(["aPlan", "zBilling"]);
  });

  it("resolves an unchanged string by the exact path, not by scoring", async () => {
    const { dir, sourceResource } = await setup({ billing: OLD_SENTENCE });

    const result = await runLocale(
      makeParams(
        { source: sourceResource, cwd: dir },
        {
          cache: {
            snapshot: memoryFor(OLD_SENTENCE, GERMAN),
            fingerprint: FINGERPRINT,
            fuzzy: { threshold: 0.9 },
          },
        },
      ),
    );

    expect(result.summary.cacheHits).toEqual(["billing"]);
    expect(result.summary.fuzzyHits).toEqual([]);
  });

  it("backfills the source text of an exact hit carried forward from an older cache", async () => {
    const { dir, sourceResource } = await setup({ billing: OLD_SENTENCE });
    const seeded = memoryFor(OLD_SENTENCE, GERMAN);

    const result = await runLocale(
      makeParams(
        { source: sourceResource, cwd: dir },
        {
          cache: {
            snapshot: { ...seeded, sources: {} },
            fingerprint: FINGERPRINT,
            fuzzy: { threshold: 0.9 },
          },
        },
      ),
    );

    expect(result.summary.cacheHits).toEqual(["billing"]);
    expect(result.cacheAdditions).toEqual([
      { contentHash: expect.any(String), value: GERMAN, source: OLD_SENTENCE },
    ]);
  });

  it("adds nothing for an exact hit whose source text is already on file", async () => {
    const { dir, sourceResource } = await setup({ billing: OLD_SENTENCE });

    const result = await runLocale(
      makeParams(
        { source: sourceResource, cwd: dir },
        {
          cache: {
            snapshot: memoryFor(OLD_SENTENCE, GERMAN),
            fingerprint: FINGERPRINT,
            fuzzy: { threshold: 0.9 },
          },
        },
      ),
    );

    expect(result.cacheAdditions).toEqual([]);
  });

  it("stores the source text alongside a freshly translated value", async () => {
    const { dir, sourceResource } = await setup({ billing: EDITED_SENTENCE });

    const result = await runLocale(
      makeParams(
        { source: sourceResource, cwd: dir },
        { cache: { snapshot: memoryFor("nothing alike", "x"), fingerprint: FINGERPRINT } },
      ),
    );

    expect(result.cacheAdditions).toEqual([
      {
        contentHash: expect.any(String),
        value: `[de] ${EDITED_SENTENCE}`,
        source: EDITED_SENTENCE,
      },
    ]);
  });
});
