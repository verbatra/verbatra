import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  TranslateRequest,
  TranslateResult,
  TranslationProvider,
} from "@verbatra/ai-providers";
import type { PlaceholderIntegrityResult } from "@verbatra/core";
import { describe, expect, it } from "vitest";
import type { VerbatraConfig } from "../config/schema.js";
import { baseConfig, makeTempDir } from "../test-support.js";
import { translate } from "./translate-project.js";

const PASS: PlaceholderIntegrityResult = {
  matches: true,
  missing: [],
  extra: [],
  reordered: false,
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function delayedProvider(delayByLocale: Readonly<Record<string, number>>): TranslationProvider {
  return {
    id: "xcstrings-race-probe",
    kind: "llm",
    supportsGlossary: true,
    translateBatch: async (request: TranslateRequest): Promise<TranslateResult> => {
      const delay = delayByLocale[request.targetLocale] ?? 0;
      if (delay > 0) {
        await sleep(delay);
      }
      const values = new Map<string, string>();
      const integrity = new Map<string, PlaceholderIntegrityResult>();
      for (const entry of request.entries) {
        values.set(entry.key, `[${request.targetLocale}] ${entry.value}`);
        integrity.set(entry.key, PASS);
      }
      return { values, integrity };
    },
  };
}

async function xcstringsProject(strings: Record<string, unknown>): Promise<string> {
  const dir = await makeTempDir();
  await writeFile(
    join(dir, "Localizable.xcstrings"),
    JSON.stringify({ sourceLanguage: "en", version: "1.0", strings }),
    "utf8",
  );
  return dir;
}

function catalogueConfig(targetLocales: readonly string[]): VerbatraConfig {
  return baseConfig({
    targetLocales: [...targetLocales],
    format: "apple-xcstrings",
    files: { pattern: "{locale}Localizable.xcstrings" },
  });
}

async function readCatalogue(dir: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(join(dir, "Localizable.xcstrings"), "utf8"));
}

function greetingLocalizations(catalogue: Record<string, unknown>): Record<string, unknown> {
  const strings = catalogue.strings as Record<string, { localizations: Record<string, unknown> }>;
  const greeting = strings.greeting;
  if (greeting === undefined) {
    throw new Error('expected a "greeting" entry in the test catalogue');
  }
  return greeting.localizations;
}

describe("translate: apple-xcstrings, multiple target locales share one catalogue", () => {
  it("leaves every target locale present after a concurrent run, none overwritten or lost", async () => {
    const targets = ["de", "fr", "es"] as const;
    const dir = await xcstringsProject({
      greeting: { localizations: { en: { stringUnit: { state: "translated", value: "Hello" } } } },
    });
    const provider = delayedProvider({ de: 30, fr: 20, es: 10 });

    const summary = await translate(
      { config: catalogueConfig(targets), cwd: dir, concurrency: 3 },
      { createProvider: () => provider },
    );

    expect(summary.failed).toEqual([]);
    expect([...summary.succeeded].sort()).toEqual([...targets].sort());

    const catalogue = await readCatalogue(dir);
    const localizations = greetingLocalizations(catalogue);
    for (const locale of targets) {
      expect(localizations[locale]).toEqual({
        stringUnit: { state: "translated", value: `[${locale}] Hello` },
      });
    }
  });

  it("resolves the source and every target locale to the identical catalogue path", async () => {
    const targets = ["de", "fr"] as const;
    const dir = await xcstringsProject({ greeting: {} });
    const provider = delayedProvider({});

    await translate(
      { config: catalogueConfig(targets), cwd: dir, concurrency: 2 },
      { createProvider: () => provider },
    );

    const catalogue = await readCatalogue(dir);
    expect(Object.keys(catalogue.strings as Record<string, unknown>)).toEqual(["greeting"]);
  });

  it("keeps a fourth target's write intact under a higher concurrency than target count", async () => {
    const targets = ["de", "fr", "es", "it"] as const;
    const dir = await xcstringsProject({
      greeting: { localizations: { en: { stringUnit: { state: "translated", value: "Hello" } } } },
    });
    const provider = delayedProvider({ de: 40, fr: 30, es: 20, it: 10 });

    const summary = await translate(
      { config: catalogueConfig(targets), cwd: dir, concurrency: 4 },
      { createProvider: () => provider },
    );

    expect(summary.failed).toEqual([]);
    const catalogue = await readCatalogue(dir);
    const localizations = greetingLocalizations(catalogue);
    for (const locale of targets) {
      expect(localizations[locale]).toBeDefined();
      expect((localizations[locale] as { stringUnit: { value: string } }).stringUnit.value).toBe(
        `[${locale}] Hello`,
      );
    }
  });
});
