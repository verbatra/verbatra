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
