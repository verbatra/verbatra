import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  createOpenAiCompatibleProvider,
  type OpenAiCompatibleDeps,
  type TranslationProvider,
} from "@verbatra/ai-providers";
import { contentHash, type LocaleResource } from "@verbatra/core";
import {
  createAndroidXmlAdapter,
  createDefaultRegistry,
  type FormatAdapter,
} from "@verbatra/format-adapters";
import { describe, expect, it } from "vitest";
import type { TranslationMemory } from "../cache/types.js";
import { defaultFs } from "../fs.js";
import { createLocalePathResolver } from "../locale-path/resolver.js";
import { makeTempDir, readJsonFile, readTextFile, writeJsonFile } from "../test-support.js";
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

function stubProvider(
  translations: ReadonlyArray<{ key: string; value: string }>,
): TranslationProvider {
  const client: NonNullable<OpenAiCompatibleDeps["client"]> = {
    chat: {
      completions: {
        create: () =>
          Promise.resolve({
            choices: [{ message: { content: JSON.stringify({ translations }) } }],
          }),
      },
    },
  };
  return createOpenAiCompatibleProvider(
    { baseUrl: "http://127.0.0.1:1234/v1", model: "local-model", maxOutputTokens: 1024 },
    { client },
  );
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

function seededMemory(
  sourceResource: LocaleResource,
  key: string,
  value: string,
): TranslationMemory {
  const entry = sourceResource.entries.get(key);
  if (entry === undefined) {
    throw new Error(`source entry ${key} is missing`);
  }
  return { version: 1, entries: { [FINGERPRINT]: { de: { [contentHash(entry)]: value } } } };
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
    provider: stubProvider([]),
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
    maxLength: undefined,
    ...overrides,
  };
}

describe("runLocale: review flags on cache hits", () => {
  it("flags a cached value that drops a mandated glossary term", async () => {
    const { dir, sourceResource } = await setup({ intro: "Save your account settings" });
    const result = await runLocale(
      makeParams(
        { source: sourceResource, cwd: dir },
        {
          glossary: { Save: "Speichern" },
          cache: {
            snapshot: seededMemory(sourceResource, "intro", "Sichere deine Kontoeinstellungen"),
            fingerprint: FINGERPRINT,
          },
        },
      ),
    );

    expect(result.summary.cacheHits).toEqual(["intro"]);
    expect(result.summary.needsReview).toEqual([
      { key: "intro", reasons: ["GLOSSARY_TERM_MISSED"] },
    ]);
  });

  it("writes and locks the flagged cached value rather than withholding it", async () => {
    const { dir, sourceResource } = await setup({ intro: "Save your account settings" });
    const result = await runLocale(
      makeParams(
        { source: sourceResource, cwd: dir },
        {
          glossary: { Save: "Speichern" },
          cache: {
            snapshot: seededMemory(sourceResource, "intro", "Sichere deine Kontoeinstellungen"),
            fingerprint: FINGERPRINT,
          },
        },
      ),
    );

    expect(result.summary.integrityMismatches).toEqual([]);
    expect(result.lockEntries).toHaveProperty("intro");
    expect(await readJsonFile(join(dir, "locales", "de.json"))).toEqual({
      intro: "Sichere deine Kontoeinstellungen",
    });
  });

  it("leaves a compliant cached value unflagged", async () => {
    const { dir, sourceResource } = await setup({ intro: "Save your account settings" });
    const result = await runLocale(
      makeParams(
        { source: sourceResource, cwd: dir },
        {
          glossary: { Save: "Speichern" },
          cache: {
            snapshot: seededMemory(sourceResource, "intro", "Speichern deine Kontoeinstellungen"),
            fingerprint: FINGERPRINT,
          },
        },
      ),
    );

    expect(result.summary.cacheHits).toEqual(["intro"]);
    expect(result.summary.needsReview).toEqual([]);
  });

  it("flags a cached value that was reused verbatim from its source", async () => {
    const { dir, sourceResource } = await setup({ intro: "Save your account settings" });
    const result = await runLocale(
      makeParams(
        { source: sourceResource, cwd: dir },
        {
          cache: {
            snapshot: seededMemory(sourceResource, "intro", "Save your account settings"),
            fingerprint: FINGERPRINT,
          },
        },
      ),
    );

    expect(result.summary.needsReview).toEqual([{ key: "intro", reasons: ["EQUALS_SOURCE"] }]);
  });

  it("raises no flag for a cached value when no glossary is configured", async () => {
    const { dir, sourceResource } = await setup({ intro: "Save your account settings" });
    const result = await runLocale(
      makeParams(
        { source: sourceResource, cwd: dir },
        {
          cache: {
            snapshot: seededMemory(sourceResource, "intro", "Sichere deine Kontoeinstellungen"),
            fingerprint: FINGERPRINT,
          },
        },
      ),
    );

    expect(result.summary.needsReview).toEqual([]);
  });

  it("reviews a cached value for a format whose adapter has no placeholder comparator", async () => {
    const androidXml = createAndroidXmlAdapter();
    const dir = await makeTempDir();
    await mkdir(join(dir, "locales"));
    await writeFile(
      join(dir, "locales", "en.xml"),
      '<?xml version="1.0" encoding="utf-8"?>\n' +
        "<resources>\n" +
        '  <string name="intro">Save your account settings</string>\n' +
        "</resources>\n",
      "utf8",
    );
    const sourceResource = (await androidXml.read(join(dir, "locales", "en.xml"), "en")).resource;
    const result = await runLocale(
      makeParams(
        { source: sourceResource, cwd: dir },
        {
          adapter: androidXml,
          format: "android-xml",
          resolver: createLocalePathResolver(dir, {
            sourceLocale: "en",
            targetLocales: ["de"],
            format: "android-xml",
            files: { pattern: "locales/{locale}.xml" },
          }),
          glossary: { Save: "Speichern" },
          cache: {
            snapshot: seededMemory(sourceResource, "intro", "Sichere deine Kontoeinstellungen"),
            fingerprint: FINGERPRINT,
          },
        },
      ),
    );

    expect(result.summary.needsReview).toEqual([
      { key: "intro", reasons: ["GLOSSARY_TERM_MISSED"] },
    ]);
    expect(await readTextFile(join(dir, "locales", "de.xml"))).toContain(
      "Sichere deine Kontoeinstellungen",
    );
  });

  it("flags a cached value whose placeholders match but landed in a different order", async () => {
    const { dir, sourceResource } = await setup({ greeting: "Hello {{first}} {{last}}" });
    const result = await runLocale(
      makeParams(
        { source: sourceResource, cwd: dir },
        {
          cache: {
            snapshot: seededMemory(sourceResource, "greeting", "Hallo {{last}} {{first}}"),
            fingerprint: FINGERPRINT,
          },
        },
      ),
    );

    expect(result.summary.cacheHits).toEqual(["greeting"]);
    expect(result.summary.integrityMismatches).toEqual([]);
    expect(result.summary.needsReview).toEqual([
      { key: "greeting", reasons: ["INTEGRITY_REORDERED"] },
    ]);
  });

  it("flags a cached value whose length is far outside the expected ratio", async () => {
    const { dir, sourceResource } = await setup({ intro: "Save your account settings now" });
    const result = await runLocale(
      makeParams(
        { source: sourceResource, cwd: dir },
        {
          cache: {
            snapshot: seededMemory(sourceResource, "intro", "Ok"),
            fingerprint: FINGERPRINT,
          },
        },
      ),
    );

    expect(result.summary.cacheHits).toEqual(["intro"]);
    expect(result.summary.needsReview).toEqual([
      { key: "intro", reasons: ["LENGTH_RATIO_OUTLIER"] },
    ]);
  });
});

describe("runLocale: review flags fanned out to content duplicates", () => {
  it("carries the representative's flag to every key sharing its source content", async () => {
    const { dir, sourceResource } = await setup({
      a: "Save your account settings",
      b: "Save your account settings",
    });
    const result = await runLocale(
      makeParams(
        { source: sourceResource, cwd: dir },
        {
          glossary: { Save: "Speichern" },
          provider: stubProvider([{ key: "a", value: "Sichere deine Kontoeinstellungen" }]),
        },
      ),
    );

    expect(result.summary.needsReview).toEqual([
      { key: "a", reasons: ["GLOSSARY_TERM_MISSED"] },
      { key: "b", reasons: ["GLOSSARY_TERM_MISSED"] },
    ]);
    expect(result.summary.integrityMismatches).toEqual([]);
    expect(await readJsonFile(join(dir, "locales", "de.json"))).toEqual({
      a: "Sichere deine Kontoeinstellungen",
      b: "Sichere deine Kontoeinstellungen",
    });
    expect(Object.keys(result.lockEntries).sort()).toEqual(["a", "b"]);
  });
});

describe("runLocale: per-key maximum length budgets", () => {
  it("flags a translated value that overruns its key's budget", async () => {
    const { dir, sourceResource } = await setup({ intro: "Save your account settings" });
    const result = await runLocale(
      makeParams(
        { source: sourceResource, cwd: dir },
        {
          provider: stubProvider([{ key: "intro", value: "Sichere deine Kontoeinstellungen" }]),
          maxLength: new Map([["intro", 10]]),
        },
      ),
    );

    expect(result.summary.needsReview).toEqual([
      { key: "intro", reasons: ["MAX_LENGTH_EXCEEDED"] },
    ]);
  });

  it("still writes and locks an over-budget value, so the flag never withholds it", async () => {
    const { dir, sourceResource } = await setup({ intro: "Save your account settings" });
    const result = await runLocale(
      makeParams(
        { source: sourceResource, cwd: dir },
        {
          provider: stubProvider([{ key: "intro", value: "Sichere deine Kontoeinstellungen" }]),
          maxLength: new Map([["intro", 10]]),
        },
      ),
    );

    expect(result.summary.integrityMismatches).toEqual([]);
    expect(result.summary.translated).toEqual(["intro"]);
    expect(result.lockEntries).toHaveProperty("intro");
    expect(await readJsonFile(join(dir, "locales", "de.json"))).toEqual({
      intro: "Sichere deine Kontoeinstellungen",
    });
  });

  it("leaves a key with no configured budget unflagged, however long its value", async () => {
    const { dir, sourceResource } = await setup({ intro: "Save your account settings" });
    const result = await runLocale(
      makeParams(
        { source: sourceResource, cwd: dir },
        {
          provider: stubProvider([{ key: "intro", value: "Sichere deine Kontoeinstellungen" }]),
          maxLength: new Map([["other", 2]]),
        },
      ),
    );

    expect(result.summary.needsReview).toEqual([]);
  });

  it("flags a cached value that overruns its key's budget", async () => {
    const { dir, sourceResource } = await setup({ intro: "Save your account settings" });
    const result = await runLocale(
      makeParams(
        { source: sourceResource, cwd: dir },
        {
          cache: {
            snapshot: seededMemory(sourceResource, "intro", "Sichere deine Kontoeinstellungen"),
            fingerprint: FINGERPRINT,
          },
          maxLength: new Map([["intro", 10]]),
        },
      ),
    );

    expect(result.summary.cacheHits).toEqual(["intro"]);
    expect(result.summary.needsReview).toEqual([
      { key: "intro", reasons: ["MAX_LENGTH_EXCEEDED"] },
    ]);
  });

  it("holds each duplicate key to its own budget, not the representative's", async () => {
    const { dir, sourceResource } = await setup({
      a: "Save your account settings",
      b: "Save your account settings",
    });
    const result = await runLocale(
      makeParams(
        { source: sourceResource, cwd: dir },
        {
          provider: stubProvider([{ key: "a", value: "Sichere deine Kontoeinstellungen" }]),
          maxLength: new Map([["b", 10]]),
        },
      ),
    );

    expect(result.summary.needsReview).toEqual([{ key: "b", reasons: ["MAX_LENGTH_EXCEEDED"] }]);
    expect(await readJsonFile(join(dir, "locales", "de.json"))).toEqual({
      a: "Sichere deine Kontoeinstellungen",
      b: "Sichere deine Kontoeinstellungen",
    });
  });

  it("keeps a duplicate key unflagged when only the representative has a budget", async () => {
    const { dir, sourceResource } = await setup({
      a: "Save your account settings",
      b: "Save your account settings",
    });
    const result = await runLocale(
      makeParams(
        { source: sourceResource, cwd: dir },
        {
          provider: stubProvider([{ key: "a", value: "Sichere deine Kontoeinstellungen" }]),
          maxLength: new Map([["a", 10]]),
        },
      ),
    );

    expect(result.summary.needsReview).toEqual([{ key: "a", reasons: ["MAX_LENGTH_EXCEEDED"] }]);
  });
});

describe("runLocale: budgets on fanned-out duplicates keep every other reason", () => {
  it("keeps the representative's other reasons while swapping in the duplicate's own overrun", async () => {
    const { dir, sourceResource } = await setup({
      a: "Save your account settings",
      b: "Save your account settings",
    });
    const result = await runLocale(
      makeParams(
        { source: sourceResource, cwd: dir },
        {
          glossary: { Save: "Speichern" },
          provider: stubProvider([{ key: "a", value: "Sichere deine Kontoeinstellungen" }]),
          maxLength: new Map([["b", 10]]),
        },
      ),
    );

    expect(result.summary.needsReview).toEqual([
      { key: "a", reasons: ["GLOSSARY_TERM_MISSED"] },
      { key: "b", reasons: ["MAX_LENGTH_EXCEEDED", "GLOSSARY_TERM_MISSED"] },
    ]);
  });

  it("orders the overrun after the ratio outlier it accompanies", async () => {
    const { dir, sourceResource } = await setup({
      a: "Save your account settings now",
      b: "Save your account settings now",
    });
    const result = await runLocale(
      makeParams(
        { source: sourceResource, cwd: dir },
        {
          provider: stubProvider([{ key: "a", value: "Ok" }]),
          maxLength: new Map([["b", 1]]),
        },
      ),
    );

    expect(result.summary.needsReview).toEqual([
      { key: "a", reasons: ["LENGTH_RATIO_OUTLIER"] },
      { key: "b", reasons: ["LENGTH_RATIO_OUTLIER", "MAX_LENGTH_EXCEEDED"] },
    ]);
  });
});

describe("runLocale: budgets across a wider duplicate group", () => {
  it("still flags a duplicate whose budget is larger than the representative's but too small", async () => {
    const { dir, sourceResource } = await setup({
      a: "Save your account settings",
      b: "Save your account settings",
    });
    const result = await runLocale(
      makeParams(
        { source: sourceResource, cwd: dir },
        {
          provider: stubProvider([{ key: "a", value: "Sichere deine Kontoeinstellungen" }]),
          maxLength: new Map([
            ["a", 5],
            ["b", 20],
          ]),
        },
      ),
    );

    expect(result.summary.needsReview).toEqual([
      { key: "a", reasons: ["MAX_LENGTH_EXCEEDED"] },
      { key: "b", reasons: ["MAX_LENGTH_EXCEEDED"] },
    ]);
  });

  it("holds each of three keys sharing one source text to its own budget", async () => {
    const { dir, sourceResource } = await setup({
      a: "Save your account settings",
      b: "Save your account settings",
      c: "Save your account settings",
    });
    const result = await runLocale(
      makeParams(
        { source: sourceResource, cwd: dir },
        {
          provider: stubProvider([{ key: "a", value: "Sichere deine Kontoeinstellungen" }]),
          maxLength: new Map([
            ["a", 100],
            ["b", 32],
            ["c", 31],
          ]),
        },
      ),
    );

    expect(result.summary.needsReview).toEqual([{ key: "c", reasons: ["MAX_LENGTH_EXCEEDED"] }]);
    expect(await readJsonFile(join(dir, "locales", "de.json"))).toEqual({
      a: "Sichere deine Kontoeinstellungen",
      b: "Sichere deine Kontoeinstellungen",
      c: "Sichere deine Kontoeinstellungen",
    });
  });
});

describe("runLocale: which keys a budget actually reaches", () => {
  it("does not measure a key that is already translated and still in step with its source", async () => {
    const { dir, sourceResource } = await setup({ intro: "Save your account settings" });
    await writeJsonFile(join(dir, "locales", "de.json"), {
      intro: "Sichere deine Kontoeinstellungen",
    });
    const sourceEntry = sourceResource.entries.get("intro");
    if (sourceEntry === undefined) {
      throw new Error("source entry intro is missing");
    }
    const result = await runLocale(
      makeParams(
        { source: sourceResource, cwd: dir },
        {
          baseline: new Map([["intro", contentHash(sourceEntry)]]),
          maxLength: new Map([["intro", 10]]),
        },
      ),
    );

    expect(result.summary.unchanged).toEqual(["intro"]);
    expect(result.summary.needsReview).toEqual([]);
  });
});
