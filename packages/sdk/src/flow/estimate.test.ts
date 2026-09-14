import type { TranslationEntry } from "@verbatra/core";
import { describe, expect, it } from "vitest";
import type { ProviderConfig } from "../config/provider-config.js";
import { type RateCard, rateCardSchema } from "../config/rate-card.js";
import {
  ESTIMATED_CHARACTERS_PER_TOKEN,
  ESTIMATED_RESPONSE_SCHEMA_TOKENS,
  ESTIMATED_SYSTEM_RULES_TOKENS,
  estimateRun,
  quantifyLocale,
} from "./estimate.js";

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
      maxBatchSize: 50,
      locales: [{ locale: "de", entries }],
    });

    expect(estimate.locales[0]?.requests).toBe(3);
    expect(estimate.requests).toBe(3);
  });

  it("sums requests and keys across every locale", () => {
    const estimate = estimateRun({
      provider: ANTHROPIC,
      maxBatchSize: 50,
      locales: [
        { locale: "de", entries: [GREETING] },
        { locale: "fr", entries: [GREETING] },
      ],
    });

    expect(estimate.keys).toBe(2);
    expect(estimate.requests).toBe(2);
  });

  it("estimates nothing for a locale with no pending keys", () => {
    const estimate = estimateRun({
      provider: ANTHROPIC,
      maxBatchSize: 50,
      locales: [{ locale: "de", entries: [] }],
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
      maxBatchSize: 50,
      locales: [{ locale: "de", entries: [GREETING] }],
    });

    expect(estimate.unit).toBe("tokens");
    expect(estimate.inputTokens).toBe(360);
    expect(estimate.outputTokens).toBe(9);
    expect(estimate.sourceCharacters).toBeUndefined();
  });

  it("counts description and meaning into the prompt but not into the response", () => {
    const described: TranslationEntry = { ...GREETING, description: "on the login screen" };
    const plain = estimateRun({
      provider: ANTHROPIC,
      maxBatchSize: 50,
      locales: [{ locale: "de", entries: [GREETING] }],
    });
    const withContext = estimateRun({
      provider: ANTHROPIC,
      maxBatchSize: 50,
      locales: [{ locale: "de", entries: [described] }],
    });

    expect(withContext.inputTokens).toBeGreaterThan(plain.inputTokens ?? 0);
    expect(withContext.outputTokens).toBe(plain.outputTokens);
  });

  it("prices a token rate against the estimated prompt and completion separately", () => {
    const estimate = estimateRun({
      provider: ANTHROPIC,
      maxBatchSize: 50,
      locales: [{ locale: "de", entries: [GREETING] }],
      rates: card({
        "anthropic/sonnet-test": { inputPerMillionTokens: 3, outputPerMillionTokens: 15 },
      }),
    });

    expect(estimate.pricing).toBe("priced");
    expect(estimate.currency).toBe("USD");
    expect(estimate.asOf).toBe("2026-01-15");
    expect(estimate.cost).toBeCloseTo(0.001215, 9);
    expect(estimate.locales[0]?.cost).toBeCloseTo(0.001215, 9);
  });

  it("warns that a token count is a heuristic and that repair requests are uncounted", () => {
    const estimate = estimateRun({
      provider: ANTHROPIC,
      maxBatchSize: 50,
      locales: [{ locale: "de", entries: [GREETING] }],
    });

    expect(estimate.caveats).toContain("TOKEN_COUNT_IS_HEURISTIC");
    expect(estimate.caveats).toContain("REPAIR_REQUESTS_NOT_COUNTED");
  });
});

describe("estimateRun: character-billed providers", () => {
  it("reports source characters and no token figure at all", () => {
    const estimate = estimateRun({
      provider: DEEPL,
      maxBatchSize: 50,
      locales: [{ locale: "de", entries: [GREETING] }],
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
      maxBatchSize: 50,
      locales: [{ locale: "de", entries: [GREETING] }],
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
      maxBatchSize: 50,
      locales: [{ locale: "de", entries: [GREETING] }],
      rates: card({ "openai-compatible/llama-3": { perMillionCharacters: 999 } }),
    });

    expect(estimate.pricing).toBe("not-billed");
    expect(estimate.cost).toBeUndefined();
    expect(estimate.currency).toBeUndefined();
    expect(estimate.inputTokens).toBe(360);
  });

  it("names the missing rate key rather than reporting a cost of zero", () => {
    const estimate = estimateRun({
      provider: ANTHROPIC,
      maxBatchSize: 50,
      locales: [{ locale: "de", entries: [GREETING] }],
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
      maxBatchSize: 50,
      locales: [{ locale: "de", entries: [GREETING] }],
    });

    expect(estimate.pricing).toBe("no-rate-on-file");
    expect(estimate.asOf).toBeUndefined();
  });

  it("refuses a rate written in the wrong unit rather than applying it", () => {
    const estimate = estimateRun({
      provider: ANTHROPIC,
      maxBatchSize: 50,
      locales: [{ locale: "de", entries: [GREETING] }],
      rates: card({ "anthropic/sonnet-test": { perMillionCharacters: 25 } }),
    });

    expect(estimate.pricing).toBe("rate-unit-mismatch");
    expect(estimate.cost).toBeUndefined();
  });

  it("prices a run with no pending keys at zero rather than withholding the figure", () => {
    const estimate = estimateRun({
      provider: ANTHROPIC,
      maxBatchSize: 50,
      locales: [{ locale: "de", entries: [] }],
      rates: card({
        "anthropic/sonnet-test": { inputPerMillionTokens: 3, outputPerMillionTokens: 15 },
      }),
    });

    expect(estimate.pricing).toBe("priced");
    expect(estimate.cost).toBe(0);
  });
});

describe("estimateRun: honesty about what the figure leaves out", () => {
  it("always records that the cache was not consulted and duplicates were not collapsed", () => {
    const estimate = estimateRun({
      provider: DEEPL,
      maxBatchSize: 50,
      locales: [{ locale: "de", entries: [GREETING] }],
    });

    expect(estimate.caveats).toContain("CACHE_NOT_CONSULTED");
    expect(estimate.caveats).toContain("SOURCE_DUPLICATES_NOT_DEDUPLICATED");
  });

  it("names the provider and model the figure was computed for", () => {
    const estimate = estimateRun({
      provider: ANTHROPIC,
      maxBatchSize: 50,
      locales: [{ locale: "de", entries: [GREETING] }],
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
  });
});

describe("quantifyLocale", () => {
  it("is the batch-level primitive: one batch of entries, one quantity", () => {
    expect(quantifyLocale([GREETING], 50)).toEqual({
      keys: 1,
      requests: 1,
      inputTokens: 360,
      outputTokens: 9,
      sourceCharacters: 11,
    });
  });

  it("charges no request overhead for an empty batch", () => {
    expect(quantifyLocale([], 50)).toEqual({
      keys: 0,
      requests: 0,
      inputTokens: 0,
      outputTokens: 0,
      sourceCharacters: 0,
    });
  });
});
