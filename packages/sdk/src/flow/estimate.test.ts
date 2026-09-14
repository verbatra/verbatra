import { dataPayloadCharacters, resultPayloadCharacters } from "@verbatra/ai-providers";
import type { LocaleResource, TranslationEntry } from "@verbatra/core";
import { describe, expect, it } from "vitest";
import type { ProviderConfig } from "../config/provider-config.js";
import { type RateCard, rateCardSchema } from "../config/rate-card.js";
import { baseConfig } from "../test-support.js";
import {
  ESTIMATED_CHARACTERS_PER_TOKEN,
  ESTIMATED_RESPONSE_SCHEMA_TOKENS,
  ESTIMATED_SYSTEM_RULES_TOKENS,
  ESTIMATED_TRANSLATION_EXPANSION,
  estimateForRun,
  estimateRun,
  type PayloadContext,
  quantifyLocale,
} from "./estimate.js";
import type { LocaleSummary } from "./summary.js";

function entry(key: string, value: string): TranslationEntry {
  return { key, namespace: "", value, placeholders: [], isPlural: false };
}

const GREETING = entry("greeting", "Hello world");

const ANTHROPIC: ProviderConfig = {
  id: "anthropic",
  options: { model: "sonnet-test", maxTokens: 4096 },
};
const DEEPL: ProviderConfig = { id: "deepl", options: {} };
const SELF_HOSTED: ProviderConfig = {
  id: "openai-compatible",
  options: { baseUrl: "http://localhost:1234/v1", model: "llama-3", maxOutputTokens: 4096 },
};

function card(table: Record<string, unknown>): RateCard {
  return rateCardSchema.parse({ asOf: "2026-01-15", currency: "USD", table });
}

describe("estimateRun: request arithmetic", () => {
  it("splits each locale into one request per maxBatchSize keys, rounding up", () => {
    const entries = Array.from({ length: 101 }, (_, index) => entry(`k${index}`, "value"));
    const estimate = estimateRun({
      provider: ANTHROPIC,
      sourceLocale: "en",
      maxBatchSize: 50,
      locales: [{ locale: "de", entries, generatedEntries: [] }],
    });

    expect(estimate.locales[0]?.requests).toBe(3);
    expect(estimate.requests).toBe(3);
  });

  it("sums requests and keys across every locale", () => {
    const estimate = estimateRun({
      provider: ANTHROPIC,
      sourceLocale: "en",
      maxBatchSize: 50,
      locales: [
        { locale: "de", entries: [GREETING], generatedEntries: [] },
        { locale: "fr", entries: [GREETING], generatedEntries: [] },
      ],
    });

    expect(estimate.keys).toBe(2);
    expect(estimate.requests).toBe(2);
  });

  it("estimates nothing for a locale with no pending keys", () => {
    const estimate = estimateRun({
      provider: ANTHROPIC,
      sourceLocale: "en",
      maxBatchSize: 50,
      locales: [{ locale: "de", entries: [], generatedEntries: [] }],
    });

    expect(estimate.locales[0]).toMatchObject({ locale: "de", keys: 0, requests: 0 });
    expect(estimate.inputTokens).toBe(0);
    expect(estimate.outputTokens).toBe(0);
  });
});

describe("estimateRun: token-billed providers", () => {
  it("charges the fixed per-request overhead once per request and scales the rest with the payload", () => {
    const estimate = estimateRun({
      provider: ANTHROPIC,
      sourceLocale: "en",
      maxBatchSize: 50,
      locales: [{ locale: "de", entries: [GREETING], generatedEntries: [] }],
    });

    expect(estimate.unit).toBe("tokens");
    expect(estimate.inputTokens).toBe(373);
    expect(estimate.outputTokens).toBe(17);
    expect(estimate.sourceCharacters).toBeUndefined();
  });

  it("counts description and meaning into the prompt but not into the response", () => {
    const described: TranslationEntry = { ...GREETING, description: "on the login screen" };
    const plain = estimateRun({
      provider: ANTHROPIC,
      sourceLocale: "en",
      maxBatchSize: 50,
      locales: [{ locale: "de", entries: [GREETING], generatedEntries: [] }],
    });
    const withContext = estimateRun({
      provider: ANTHROPIC,
      sourceLocale: "en",
      maxBatchSize: 50,
      locales: [{ locale: "de", entries: [described], generatedEntries: [] }],
    });

    expect(withContext.inputTokens).toBeGreaterThan(plain.inputTokens ?? 0);
    expect(withContext.outputTokens).toBe(plain.outputTokens);
  });

  it("prices a token rate against the estimated prompt and completion separately", () => {
    const estimate = estimateRun({
      provider: ANTHROPIC,
      sourceLocale: "en",
      maxBatchSize: 50,
      locales: [{ locale: "de", entries: [GREETING], generatedEntries: [] }],
      rates: card({
        "anthropic/sonnet-test": { inputPerMillionTokens: 3, outputPerMillionTokens: 15 },
      }),
    });

    expect(estimate.pricing).toBe("priced");
    expect(estimate.currency).toBe("USD");
    expect(estimate.asOf).toBe("2026-01-15");
    expect(estimate.cost).toBeCloseTo(0.001374, 9);
    expect(estimate.locales[0]?.cost).toBeCloseTo(0.001374, 9);
  });

  it("warns that a token count is a heuristic and that repair requests are uncounted", () => {
    const estimate = estimateRun({
      provider: ANTHROPIC,
      sourceLocale: "en",
      maxBatchSize: 50,
      locales: [{ locale: "de", entries: [GREETING], generatedEntries: [] }],
    });

    expect(estimate.caveats).toContain("TOKEN_COUNT_IS_HEURISTIC");
    expect(estimate.caveats).toContain("REPAIR_REQUESTS_NOT_COUNTED");
  });
});

describe("estimateRun: character-billed providers", () => {
  it("reports source characters and no token figure at all", () => {
    const estimate = estimateRun({
      provider: DEEPL,
      sourceLocale: "en",
      maxBatchSize: 50,
      locales: [{ locale: "de", entries: [GREETING], generatedEntries: [] }],
    });

    expect(estimate.unit).toBe("characters");
    expect(estimate.sourceCharacters).toBe(11);
    expect(estimate.inputTokens).toBeUndefined();
    expect(estimate.outputTokens).toBeUndefined();
    expect(estimate.caveats).not.toContain("TOKEN_COUNT_IS_HEURISTIC");
  });

  it("looks a character rate up under the bare provider id and prices the source text", () => {
    const estimate = estimateRun({
      provider: DEEPL,
      sourceLocale: "en",
      maxBatchSize: 50,
      locales: [{ locale: "de", entries: [GREETING], generatedEntries: [] }],
      rates: card({ deepl: { perMillionCharacters: 25 } }),
    });

    expect(estimate.rateKey).toBe("deepl");
    expect(estimate.pricing).toBe("priced");
    expect(estimate.cost).toBeCloseTo(0.000275, 9);
  });
});

describe("estimateRun: what cannot be priced", () => {
  it("reports a self-hosted endpoint as unbilled and never invents a currency figure", () => {
    const estimate = estimateRun({
      provider: SELF_HOSTED,
      sourceLocale: "en",
      maxBatchSize: 50,
      locales: [{ locale: "de", entries: [GREETING], generatedEntries: [] }],
      rates: card({ "openai-compatible/llama-3": { perMillionCharacters: 999 } }),
    });

    expect(estimate.pricing).toBe("not-billed");
    expect(estimate.cost).toBeUndefined();
    expect(estimate.currency).toBeUndefined();
    expect(estimate.inputTokens).toBe(373);
  });

  it("names the missing rate key rather than reporting a cost of zero", () => {
    const estimate = estimateRun({
      provider: ANTHROPIC,
      sourceLocale: "en",
      maxBatchSize: 50,
      locales: [{ locale: "de", entries: [GREETING], generatedEntries: [] }],
      rates: card({
        "openai/gpt-4.1-mini": { inputPerMillionTokens: 1, outputPerMillionTokens: 2 },
      }),
    });

    expect(estimate.pricing).toBe("no-rate-on-file");
    expect(estimate.rateKey).toBe("anthropic/sonnet-test");
    expect(estimate.cost).toBeUndefined();
    expect(estimate.locales[0]?.cost).toBeUndefined();
  });

  it("reports no rate on file when the project configured no rates at all", () => {
    const estimate = estimateRun({
      provider: ANTHROPIC,
      sourceLocale: "en",
      maxBatchSize: 50,
      locales: [{ locale: "de", entries: [GREETING], generatedEntries: [] }],
    });

    expect(estimate.pricing).toBe("no-rate-on-file");
    expect(estimate.asOf).toBeUndefined();
  });

  it("refuses a rate written in the wrong unit rather than applying it", () => {
    const estimate = estimateRun({
      provider: ANTHROPIC,
      sourceLocale: "en",
      maxBatchSize: 50,
      locales: [{ locale: "de", entries: [GREETING], generatedEntries: [] }],
      rates: card({ "anthropic/sonnet-test": { perMillionCharacters: 25 } }),
    });

    expect(estimate.pricing).toBe("rate-unit-mismatch");
    expect(estimate.cost).toBeUndefined();
  });

  it("prices a run with no pending keys at zero rather than withholding the figure", () => {
    const estimate = estimateRun({
      provider: ANTHROPIC,
      sourceLocale: "en",
      maxBatchSize: 50,
      locales: [{ locale: "de", entries: [], generatedEntries: [] }],
      rates: card({
        "anthropic/sonnet-test": { inputPerMillionTokens: 3, outputPerMillionTokens: 15 },
      }),
    });

    expect(estimate.pricing).toBe("priced");
    expect(estimate.cost).toBe(0);
  });
});

describe("estimateRun: the exact excludes list", () => {
  function caveatsOf(provider: ProviderConfig): readonly string[] {
    return estimateRun({
      provider,
      sourceLocale: "en",
      maxBatchSize: 50,
      locales: [{ locale: "de", entries: [GREETING], generatedEntries: [] }],
    }).caveats;
  }

  it("names six things on a token-billed provider, in a fixed order", () => {
    expect(caveatsOf(ANTHROPIC)).toEqual([
      "CACHE_NOT_CONSULTED",
      "SOURCE_DUPLICATES_NOT_DEDUPLICATED",
      "TRANSPORT_RETRIES_NOT_COUNTED",
      "TRANSLATION_LENGTH_IS_ESTIMATED",
      "TOKEN_COUNT_IS_HEURISTIC",
      "REPAIR_REQUESTS_NOT_COUNTED",
    ]);
  });

  it("names three on a character-billed provider, which has no tokens and no repair round", () => {
    expect(caveatsOf(DEEPL)).toEqual([
      "CACHE_NOT_CONSULTED",
      "SOURCE_DUPLICATES_NOT_DEDUPLICATED",
      "TRANSPORT_RETRIES_NOT_COUNTED",
    ]);
  });

  it("names the retry the provider SDKs perform underneath every planned request", () => {
    expect(caveatsOf(ANTHROPIC)).toContain("TRANSPORT_RETRIES_NOT_COUNTED");
    expect(caveatsOf(DEEPL)).toContain("TRANSPORT_RETRIES_NOT_COUNTED");
  });
});

describe("estimateRun: honesty about what the figure leaves out", () => {
  it("always records that the cache was not consulted and duplicates were not collapsed", () => {
    const estimate = estimateRun({
      provider: DEEPL,
      sourceLocale: "en",
      maxBatchSize: 50,
      locales: [{ locale: "de", entries: [GREETING], generatedEntries: [] }],
    });

    expect(estimate.caveats).toContain("CACHE_NOT_CONSULTED");
    expect(estimate.caveats).toContain("SOURCE_DUPLICATES_NOT_DEDUPLICATED");
  });

  it("names the provider and model the figure was computed for", () => {
    const estimate = estimateRun({
      provider: ANTHROPIC,
      sourceLocale: "en",
      maxBatchSize: 50,
      locales: [{ locale: "de", entries: [GREETING], generatedEntries: [] }],
    });

    expect(estimate.provider).toBe("anthropic");
    expect(estimate.model).toBe("sonnet-test");
  });
});

describe("the estimation heuristic", () => {
  it("holds the per-request overhead and character density the cost guide publishes", () => {
    expect(ESTIMATED_SYSTEM_RULES_TOKENS).toBe(250);
    expect(ESTIMATED_RESPONSE_SCHEMA_TOKENS).toBe(100);
    expect(ESTIMATED_CHARACTERS_PER_TOKEN).toBe(4);
    expect(ESTIMATED_TRANSLATION_EXPANSION).toBe(1.5);
  });
});

const CONTEXT: PayloadContext = { sourceLocale: "en", targetLocale: "de" };

describe("quantifyLocale", () => {
  it("is the batch-level primitive: one batch of entries, one quantity", () => {
    expect(quantifyLocale([GREETING], CONTEXT, 50)).toEqual({
      keys: 1,
      requests: 1,
      inputTokens: 373,
      outputTokens: 17,
      sourceCharacters: 11,
    });
  });

  it("charges no request overhead for an empty batch", () => {
    expect(quantifyLocale([], CONTEXT, 50)).toEqual({
      keys: 0,
      requests: 0,
      inputTokens: 0,
      outputTokens: 0,
      sourceCharacters: 0,
    });
  });

  it("derives the prompt from the serialized request payload rather than a parallel model", () => {
    const quantity = quantifyLocale([GREETING], CONTEXT, 50);
    const payload = dataPayloadCharacters({
      sourceLocale: "en",
      targetLocale: "de",
      entries: [GREETING],
    });

    expect(quantity.inputTokens).toBe(
      ESTIMATED_SYSTEM_RULES_TOKENS +
        ESTIMATED_RESPONSE_SCHEMA_TOKENS +
        Math.ceil(payload / ESTIMATED_CHARACTERS_PER_TOKEN),
    );
  });

  it("derives the response from the schema the provider is bound to, plus the expansion allowance", () => {
    const quantity = quantifyLocale([GREETING], CONTEXT, 50);
    const envelope = resultPayloadCharacters([{ key: GREETING.key, value: GREETING.value }]);
    const allowance = Math.ceil(GREETING.value.length * (ESTIMATED_TRANSLATION_EXPANSION - 1));

    expect(quantity.outputTokens).toBe(
      Math.ceil((envelope + allowance) / ESTIMATED_CHARACTERS_PER_TOKEN),
    );
  });

  it("sizes the response for a translation that expands, not for the source it came from", () => {
    const long = entry("k", "x".repeat(400));
    const quantity = quantifyLocale([long], CONTEXT, 50);
    const sourceSized = resultPayloadCharacters([{ key: long.key, value: long.value }]);

    expect(quantity.outputTokens).toBeGreaterThanOrEqual(
      Math.ceil(
        (sourceSized + 400 * (ESTIMATED_TRANSLATION_EXPANSION - 1)) /
          ESTIMATED_CHARACTERS_PER_TOKEN,
      ),
    );
    expect(quantity.outputTokens).toBeGreaterThan(
      Math.ceil(sourceSized / ESTIMATED_CHARACTERS_PER_TOKEN),
    );
  });

  it("leaves the prompt untouched by the expansion allowance, which only sizes the response", () => {
    const short = entry("k", "x");
    const long = entry("k", "x".repeat(400));

    expect(quantifyLocale([long], CONTEXT, 50).inputTokens).toBe(
      ESTIMATED_SYSTEM_RULES_TOKENS +
        ESTIMATED_RESPONSE_SCHEMA_TOKENS +
        Math.ceil(
          dataPayloadCharacters({ ...CONTEXT, entries: [long] }) / ESTIMATED_CHARACTERS_PER_TOKEN,
        ),
    );
    expect(quantifyLocale([short], CONTEXT, 50).inputTokens).toBeLessThan(
      quantifyLocale([long], CONTEXT, 50).inputTokens,
    );
  });
});

describe("quantifyLocale: everything the request carries is counted", () => {
  it("counts a glossary, which travels in full in every single request", () => {
    const glossary = Object.fromEntries(
      Array.from({ length: 200 }, (_, index) => [`sourceTerm${index}`, `targetTerm${index}`]),
    );
    const without = quantifyLocale([GREETING], CONTEXT, 50);
    const withGlossary = quantifyLocale([GREETING], { ...CONTEXT, glossary }, 50);

    expect(withGlossary.inputTokens).toBeGreaterThan(without.inputTokens * 4);
  });

  it("charges the glossary once per request, so two requests carry it twice", () => {
    const glossary = { Hello: "Hallo" };
    const entries = Array.from({ length: 60 }, (_, index) => entry(`k${index}`, "value"));
    const without = quantifyLocale(entries, CONTEXT, 50);
    const withGlossary = quantifyLocale(entries, { ...CONTEXT, glossary }, 50);
    const glossaryCharacters = JSON.stringify(glossary).length;

    expect(withGlossary.requests).toBe(2);
    expect(withGlossary.inputTokens - without.inputTokens).toBeGreaterThanOrEqual(
      Math.floor((2 * glossaryCharacters) / ESTIMATED_CHARACTERS_PER_TOKEN),
    );
  });

  it("counts the tone, which also travels in every request", () => {
    const without = quantifyLocale([GREETING], CONTEXT, 50);
    const withTone = quantifyLocale([GREETING], { ...CONTEXT, tone: "informal" }, 50);

    expect(withTone.inputTokens).toBeGreaterThan(without.inputTokens);
  });

  it("counts the target locale, so a longer locale tag is not free", () => {
    const short = quantifyLocale([GREETING], CONTEXT, 50);
    const long = quantifyLocale(
      [GREETING],
      { ...CONTEXT, targetLocale: "zh-Hant-TW-x-private-use" },
      50,
    );

    expect(long.inputTokens).toBeGreaterThan(short.inputTokens);
  });
});

describe("estimateRun: a rate the schema let through must still not invent a figure", () => {
  it("prices a zero rate at zero rather than treating a free tier as an absent rate", () => {
    const estimate = estimateRun({
      provider: ANTHROPIC,
      sourceLocale: "en",
      maxBatchSize: 50,
      locales: [{ locale: "de", entries: [GREETING], generatedEntries: [] }],
      rates: card({
        "anthropic/sonnet-test": { inputPerMillionTokens: 0, outputPerMillionTokens: 0 },
      }),
    });

    expect(estimate.pricing).toBe("priced");
    expect(estimate.cost).toBe(0);
  });

  it("refuses a token rate filed against a character-billed provider", () => {
    const estimate = estimateRun({
      provider: DEEPL,
      sourceLocale: "en",
      maxBatchSize: 50,
      locales: [{ locale: "de", entries: [GREETING], generatedEntries: [] }],
      rates: card({ deepl: { inputPerMillionTokens: 3, outputPerMillionTokens: 15 } }),
    });

    expect(estimate.pricing).toBe("rate-unit-mismatch");
    expect(estimate.cost).toBeUndefined();
    expect(estimate.locales[0]?.cost).toBeUndefined();
    expect(estimate.sourceCharacters).toBe(11);
  });

  it("treats an empty table as no rate on file rather than as a rate of zero", () => {
    const estimate = estimateRun({
      provider: ANTHROPIC,
      sourceLocale: "en",
      maxBatchSize: 50,
      locales: [{ locale: "de", entries: [GREETING], generatedEntries: [] }],
      rates: card({}),
    });

    expect(estimate.pricing).toBe("no-rate-on-file");
    expect(estimate.cost).toBeUndefined();
  });

  it("stays finite and scales linearly on a run far larger than any real project", () => {
    const long = entry("k", "x".repeat(1_000_000));
    const single = estimateRun({
      provider: ANTHROPIC,
      sourceLocale: "en",
      maxBatchSize: 50,
      locales: [{ locale: "de", entries: [long], generatedEntries: [] }],
      rates: card({
        "anthropic/sonnet-test": { inputPerMillionTokens: 3, outputPerMillionTokens: 15 },
      }),
    });
    const doubled = estimateRun({
      provider: ANTHROPIC,
      sourceLocale: "en",
      maxBatchSize: 50,
      locales: [
        { locale: "de", entries: [long], generatedEntries: [] },
        { locale: "fr", entries: [long], generatedEntries: [] },
      ],
      rates: card({
        "anthropic/sonnet-test": { inputPerMillionTokens: 3, outputPerMillionTokens: 15 },
      }),
    });

    expect(Number.isFinite(single.cost ?? Number.NaN)).toBe(true);
    expect(doubled.cost).toBeCloseTo((single.cost ?? 0) * 2, 6);
  });
});

describe("estimateForRun", () => {
  function summary(locale: string, translated: readonly string[]): LocaleSummary {
    return {
      locale,
      status: "succeeded",
      translated: [...translated],
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
      notices: [],
      needsReview: [],
      unfilled: [],
      malformedRows: [],
      duplicateKeys: [],
    };
  }

  function source(entries: readonly TranslationEntry[]): LocaleResource {
    return {
      locale: "en",
      namespace: "",
      format: "i18next-json",
      entries: new Map(entries.map((item) => [item.key, item])),
    };
  }

  it("reports no rate on file when the config carries no rates block", () => {
    const estimate = estimateForRun({
      summaries: [summary("de", ["greeting"])],
      source: source([GREETING]),
      config: baseConfig({ provider: ANTHROPIC }),
      maxBatchSize: 50,
    });

    expect(estimate.pricing).toBe("no-rate-on-file");
  });

  it("carries the config's glossary into the figure, because every request carries it", () => {
    const glossary = Object.fromEntries(
      Array.from({ length: 200 }, (_, index) => [`sourceTerm${index}`, `targetTerm${index}`]),
    );
    const plain = estimateForRun({
      summaries: [summary("de", ["greeting"])],
      source: source([GREETING]),
      config: baseConfig({ provider: ANTHROPIC }),
      maxBatchSize: 50,
    });
    const withGlossary = estimateForRun({
      summaries: [summary("de", ["greeting"])],
      source: source([GREETING]),
      config: baseConfig({ provider: ANTHROPIC, glossary }),
      maxBatchSize: 50,
    });

    expect(withGlossary.inputTokens ?? 0).toBeGreaterThan((plain.inputTokens ?? 0) * 4);
  });

  it("carries the config's tone into the figure", () => {
    const plain = estimateForRun({
      summaries: [summary("de", ["greeting"])],
      source: source([GREETING]),
      config: baseConfig({ provider: ANTHROPIC }),
      maxBatchSize: 50,
    });
    const withTone = estimateForRun({
      summaries: [summary("de", ["greeting"])],
      source: source([GREETING]),
      config: baseConfig({ provider: ANTHROPIC, tone: "informal" }),
      maxBatchSize: 50,
    });

    expect(withTone.inputTokens ?? 0).toBeGreaterThan(plain.inputTokens ?? 0);
  });

  it("uses the config's source locale, which is part of every request payload", () => {
    const estimate = estimateForRun({
      summaries: [summary("de", ["greeting"])],
      source: source([GREETING]),
      config: baseConfig({ provider: ANTHROPIC, sourceLocale: "en-GB-oxendict" }),
      maxBatchSize: 50,
    });
    const shorter = estimateForRun({
      summaries: [summary("de", ["greeting"])],
      source: source([GREETING]),
      config: baseConfig({ provider: ANTHROPIC }),
      maxBatchSize: 50,
    });

    expect(estimate.inputTokens ?? 0).toBeGreaterThan(shorter.inputTokens ?? 0);
  });
});
