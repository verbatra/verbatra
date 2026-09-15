import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { TranslateRequest, TranslationProvider } from "@verbatra/ai-providers";
import { contentHash, type LocaleResource, similarityRatio } from "@verbatra/core";
import { createDefaultRegistry, type FormatAdapter } from "@verbatra/format-adapters";
import { describe, expect, it } from "vitest";
import type { TranslationMemory } from "../cache/types.js";
import { defaultFs } from "../fs.js";
import { createLocalePathResolver } from "../locale-path/resolver.js";
import { makeTempDir, readJsonFile, writeJsonFile } from "../test-support.js";
import { createBudgetTracker } from "./budget.js";
import { type LocaleRunParams, type LocaleRunResult, runLocale } from "./locale-run.js";
import type { NeedsReviewEntry } from "./summary.js";

const FINGERPRINT = "fp1";
const DEFAULT_THRESHOLD = 0.9;
const CACHED_TRANSLATION = "ZWISCHENGESPEICHERT";

function i18nextAdapter(): FormatAdapter {
  const resolution = createDefaultRegistry().resolve("", { format: "i18next-json" });
  if (resolution.status !== "resolved") {
    throw new Error("i18next adapter did not resolve");
  }
  return resolution.adapter;
}

const adapter = i18nextAdapter();

function countingProvider(): { provider: TranslationProvider; requests: TranslateRequest[] } {
  const requests: TranslateRequest[] = [];
  const provider: TranslationProvider = {
    id: "openai-compatible",
    kind: "llm",
    supportsGlossary: false,
    translateBatch: (request) => {
      requests.push(request);
      const values = new Map<string, string>();
      for (const entry of request.entries) {
        values.set(entry.key, `[de] ${entry.value}`);
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

interface EditedRun {
  readonly result: LocaleRunResult;
  readonly requests: TranslateRequest[];
  readonly written: Record<string, string>;
}

async function runEdit(
  previousSource: string,
  currentSource: string,
  threshold = DEFAULT_THRESHOLD,
): Promise<EditedRun> {
  const { dir, sourceResource } = await setup({ subject: currentSource });
  const stub = countingProvider();
  const result = await runLocale(
    makeParams(
      { source: sourceResource, cwd: dir },
      {
        provider: stub.provider,
        cache: {
          snapshot: memoryFor(previousSource, CACHED_TRANSLATION),
          fingerprint: FINGERPRINT,
          fuzzy: { threshold },
        },
      },
    ),
  );
  const written = (await readJsonFile(join(dir, "locales", "de.json"))) as Record<string, string>;
  return { result, requests: stub.requests, written };
}

const MEANING_CHANGING_EDITS: ReadonlyArray<readonly [string, string, string]> = [
  [
    "the negation was dropped from a long sentence",
    "Do not delete this file permanently from the server",
    "Do delete this file permanently from the server",
  ],
  [
    "the modal was inverted",
    "This action cannot be undone once confirmed",
    "This action can be undone once confirmed",
  ],
  [
    "the unit changed from megabytes to gigabytes",
    "Your upload limit is five MB per file attachment",
    "Your upload limit is five GB per file attachment",
  ],
  [
    "the proper noun changed",
    "Sign in with your Google account to continue",
    "Sign in with your Apple account to continue",
  ],
  [
    "a singular subject became plural",
    "Delete the selected file from this folder",
    "Delete the selected files from this folder",
  ],
  [
    "a statement became a question",
    "Are you sure you want to continue",
    "Are you sure you want to continue?",
  ],
  [
    "only the leading capital changed",
    "save changes before leaving the page",
    "Save changes before leaving the page",
  ],
];

describe("runLocale: a meaning-changing edit is reused only as a flagged value", () => {
  it.each(MEANING_CHANGING_EDITS)(
    "still scores above the default threshold when %s",
    (_label, previous, current) => {
      expect(similarityRatio(previous, current)).toBeGreaterThanOrEqual(DEFAULT_THRESHOLD);
    },
  );

  it.each(MEANING_CHANGING_EDITS)(
    "flags the reuse for review when %s",
    async (_label, previous, current) => {
      const { result } = await runEdit(previous, current);

      expect(result.summary.fuzzyHits.map((hit) => hit.key)).toEqual(["subject"]);
      expect(result.summary.needsReview).toEqual([
        { key: "subject", reasons: expect.arrayContaining(["FUZZY_CACHE_REUSE"]) },
      ]);
    },
  );

  it.each(MEANING_CHANGING_EDITS)(
    "still spends nothing and still writes the reused value when %s",
    async (_label, previous, current) => {
      const { requests, written } = await runEdit(previous, current);

      expect(requests).toHaveLength(0);
      expect(written.subject).toBe(CACHED_TRANSLATION);
    },
  );
});

describe("runLocale: a fuzzy reuse leaves the key changed, so it is offered again", () => {
  const PREVIOUS = "Do not delete this file permanently from the server";
  const CURRENT = "Do delete this file permanently from the server";

  function hashOf(value: string): string {
    return contentHash({
      key: "seed",
      namespace: "",
      value,
      placeholders: adapter.extractPlaceholders(value),
      isPlural: false,
    });
  }

  it("does not lock the edited source, so the next run still sees the key as changed", async () => {
    const { dir, sourceResource } = await setup({ subject: CURRENT });

    const result = await runLocale(
      makeParams(
        { source: sourceResource, cwd: dir },
        {
          baseline: new Map([["subject", hashOf(PREVIOUS)]]),
          cache: {
            snapshot: memoryFor(PREVIOUS, CACHED_TRANSLATION),
            fingerprint: FINGERPRINT,
            fuzzy: { threshold: DEFAULT_THRESHOLD },
          },
        },
      ),
    );

    expect(result.summary.fuzzyHits.map((hit) => hit.key)).toEqual(["subject"]);
    expect(result.lockEntries.subject).toBe(hashOf(PREVIOUS));
    expect(result.lockEntries.subject).not.toBe(hashOf(CURRENT));
  });

  it("locks nothing at all for a key that had no prior baseline", async () => {
    const { dir, sourceResource } = await setup({ subject: CURRENT });

    const result = await runLocale(
      makeParams(
        { source: sourceResource, cwd: dir },
        {
          cache: {
            snapshot: memoryFor(PREVIOUS, CACHED_TRANSLATION),
            fingerprint: FINGERPRINT,
            fuzzy: { threshold: DEFAULT_THRESHOLD },
          },
        },
      ),
    );

    expect(result.summary.fuzzyHits.map((hit) => hit.key)).toEqual(["subject"]);
    expect(result.lockEntries).not.toHaveProperty("subject");
  });

  it("locks the edited source normally when the provider did the work", async () => {
    const { dir, sourceResource } = await setup({ subject: CURRENT });

    const result = await runLocale(
      makeParams(
        { source: sourceResource, cwd: dir },
        { baseline: new Map([["subject", hashOf(PREVIOUS)]]) },
      ),
    );

    expect(result.summary.translated).toEqual(["subject"]);
    expect(result.lockEntries.subject).toBe(hashOf(CURRENT));
  });

  it("still writes the reused text to the target file despite withholding the lock", async () => {
    const { written } = await runEdit(PREVIOUS, CURRENT);

    expect(written.subject).toBe(CACHED_TRANSLATION);
  });

  it("counts the key as accepted work, so the locale does not read as failed", async () => {
    const { result } = await runEdit(PREVIOUS, CURRENT);

    expect(result.summary.status).toBe("succeeded");
    expect(result.summary.integrityMismatches).toEqual([]);
    expect(result.summary.unfilled).toEqual([]);
  });
});

describe("runLocale: a changed number is refused whatever it scores", () => {
  it("refuses a quantity change that scores far above the default threshold", async () => {
    const previous = "You have 5 items left in your shopping cart";
    const current = "You have 6 items left in your shopping cart";

    expect(similarityRatio(previous, current)).toBeGreaterThan(0.97);

    const { result, requests } = await runEdit(previous, current);

    expect(result.summary.fuzzyHits).toEqual([]);
    expect(requests).toHaveLength(1);
  });

  it("refuses a single digit change at the highest threshold the config schema allows", async () => {
    const previous = `Retry the upload after ${"a".repeat(56)} 5`;
    const current = previous.replace(/5$/, "6");

    expect(similarityRatio(previous, current)).toBeGreaterThan(0.98);

    const { result, requests } = await runEdit(previous, current, 0.98);

    expect(result.summary.fuzzyHits).toEqual([]);
    expect(requests).toHaveLength(1);
  });

  it("refuses a reuse when a number was added to a source that had none", async () => {
    const previous =
      "Your upload limit is five MB per file attachment and cannot be raised on this plan";
    const current =
      "Your upload limit is 5 MB per file attachment and cannot be raised on this plan";

    expect(similarityRatio(previous, current)).toBeGreaterThanOrEqual(DEFAULT_THRESHOLD);

    const { result, requests } = await runEdit(previous, current);

    expect(result.summary.fuzzyHits).toEqual([]);
    expect(requests).toHaveLength(1);
  });

  it("reuses when the digits are untouched and only wording around them changed", async () => {
    const { result } = await runEdit(
      "You have 5 items left in your shopping cart",
      "You have 5 items left in your shopping carts",
    );

    expect(result.summary.fuzzyHits.map((hit) => hit.key)).toEqual(["subject"]);
  });
});

describe("runLocale: fuzzy reuse only ever touches keys whose source text changed", () => {
  const VALUE = "Archive the selected conversation";

  function withDescription(resource: LocaleResource, description: string): LocaleResource {
    const entries = new Map(resource.entries);
    const entry = entries.get("subject");
    if (entry === undefined) {
      throw new Error("fixture is missing the subject entry");
    }
    entries.set("subject", { ...entry, description });
    return { ...resource, entries };
  }

  it("sends a description-only change to the provider instead of reusing the old translation", async () => {
    const { dir, sourceResource } = await setup({ subject: VALUE });
    const stub = countingProvider();

    const result = await runLocale(
      makeParams(
        { source: withDescription(sourceResource, "Archive, not delete"), cwd: dir },
        {
          provider: stub.provider,
          cache: {
            snapshot: memoryFor(VALUE, CACHED_TRANSLATION),
            fingerprint: FINGERPRINT,
            fuzzy: { threshold: DEFAULT_THRESHOLD },
          },
        },
      ),
    );

    expect(result.summary.fuzzyHits).toEqual([]);
    expect(result.summary.translated).toEqual(["subject"]);
    expect(stub.requests).toHaveLength(1);
  });

  it("hands the provider the new guidance rather than translating without it", async () => {
    const { dir, sourceResource } = await setup({ subject: VALUE });
    const stub = countingProvider();

    await runLocale(
      makeParams(
        { source: withDescription(sourceResource, "Archive, not delete"), cwd: dir },
        {
          provider: stub.provider,
          cache: {
            snapshot: memoryFor(VALUE, CACHED_TRANSLATION),
            fingerprint: FINGERPRINT,
            fuzzy: { threshold: DEFAULT_THRESHOLD },
          },
        },
      ),
    );

    expect(stub.requests[0]?.entries[0]?.description).toBe("Archive, not delete");
  });

  it("behaves the same whether or not fuzzy reuse is enabled", async () => {
    async function runWith(fuzzy: boolean): Promise<{
      requests: number;
      translated: readonly string[];
      needsReview: readonly NeedsReviewEntry[];
    }> {
      const { dir, sourceResource } = await setup({ subject: VALUE });
      const stub = countingProvider();
      const result = await runLocale(
        makeParams(
          { source: withDescription(sourceResource, "Archive, not delete"), cwd: dir },
          {
            provider: stub.provider,
            cache: {
              snapshot: memoryFor(VALUE, CACHED_TRANSLATION),
              fingerprint: FINGERPRINT,
              ...(fuzzy ? { fuzzy: { threshold: DEFAULT_THRESHOLD } } : {}),
            },
          },
        ),
      );
      return {
        requests: stub.requests.length,
        translated: result.summary.translated,
        needsReview: result.summary.needsReview,
      };
    }

    const off = await runWith(false);
    const on = await runWith(true);

    expect(on.requests).toBe(off.requests);
    expect(on.translated).toEqual(off.translated);
    expect(on.needsReview).toEqual(off.needsReview);
  });
});
