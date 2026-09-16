import type {
  TranslateRequest,
  TranslateResult,
  TranslationProvider,
} from "@verbatra/ai-providers";
import type { LocaleResource, TranslationEntry } from "@verbatra/core";
import { createDefaultRegistry, type FormatAdapter } from "@verbatra/format-adapters";
import { describe, expect, it } from "vitest";
import { createBudgetTracker } from "./budget.js";
import { generatePluralForms, type PluralGenerationContext } from "./plural-generation.js";

const SOURCE_ONE = "Read <b>the docs</b> for <i>one</i> item";
const SOURCE_OTHER = "Read <b>the docs</b> for <i>many</i> items";

function i18nextAdapter(): FormatAdapter {
  const resolution = createDefaultRegistry().resolve("", { format: "i18next-json" });
  if (resolution.status !== "resolved") {
    throw new Error("i18next adapter did not resolve");
  }
  return resolution.adapter;
}

function pluralEntry(adapter: FormatAdapter, key: string, value: string): TranslationEntry {
  return {
    key,
    namespace: "n",
    value,
    placeholders: adapter.extractPlaceholders(value),
    isPlural: true,
  };
}

function sourceResource(adapter: FormatAdapter): LocaleResource {
  return {
    locale: "en",
    namespace: "n",
    format: "i18next-json",
    entries: new Map([
      ["items_one", pluralEntry(adapter, "items_one", SOURCE_ONE)],
      ["items_other", pluralEntry(adapter, "items_other", SOURCE_OTHER)],
    ]),
  };
}

function providerAnswering(translate: (value: string) => string): TranslationProvider {
  return {
    id: "stub",
    kind: "llm",
    supportsGlossary: true,
    translateBatch: (request: TranslateRequest): Promise<TranslateResult> => {
      const values = new Map<string, string>();
      const integrity = new Map(
        request.entries.map((entry) => {
          values.set(entry.key, translate(entry.value));
          return [entry.key, { matches: true, missing: [], extra: [], reordered: false }] as const;
        }),
      );
      return Promise.resolve({ values, integrity });
    },
  };
}

function context(adapter: FormatAdapter, provider: TranslationProvider): PluralGenerationContext {
  return {
    source: sourceResource(adapter),
    sourceLocale: "en",
    targetLocale: "pl",
    format: "i18next-json",
    adapter,
    provider,
    glossary: undefined,
    maxLength: undefined,
    tone: undefined,
    baseline: new Map(),
    targetKeys: new Set(),
    maxBatchSize: 50,
    budget: createBudgetTracker(undefined, "warn"),
  };
}

describe("generatePluralForms: a generated form is held to the markup gate too", () => {
  it("withholds a generated form that dropped a tag pair the source carried", async () => {
    const adapter = i18nextAdapter();
    const provider = providerAnswering((value) => value.replaceAll(/<\/?i>/g, ""));

    const result = await generatePluralForms(context(adapter, provider));

    expect(result.accepted).toEqual([]);
    expect(result.withheld.length).toBeGreaterThan(0);
  });

  it("withholds a generated form whose tags came back mis-nested", async () => {
    const adapter = i18nextAdapter();
    const provider = providerAnswering(() => "Lies <b>die Doku<i>fuer</b> eins</i>");

    const result = await generatePluralForms(context(adapter, provider));

    expect(result.accepted).toEqual([]);
    expect(result.withheld.length).toBeGreaterThan(0);
  });

  it("accepts a generated form that carries the same tags in a different order", async () => {
    const adapter = i18nextAdapter();
    const provider = providerAnswering(() => "<i>Eins</i>: lies <b>die Doku</b>");

    const result = await generatePluralForms(context(adapter, provider));

    expect(result.withheld).toEqual([]);
    expect(result.accepted.length).toBeGreaterThan(0);
  });
});
