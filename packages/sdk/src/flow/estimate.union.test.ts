import { describe, expect, expectTypeOf, it } from "vitest";
import type { ProviderConfig } from "../config/provider-config.js";
import { rateCardSchema } from "../config/rate-card.js";
import { estimateRun } from "./estimate.js";
import type {
  LocaleEstimate,
  PricedLocaleEstimate,
  PricedRunEstimate,
  RunEstimate,
  UnpricedRunEstimate,
} from "./summary.js";

const ANTHROPIC: ProviderConfig = {
  id: "anthropic",
  options: { model: "sonnet-test", maxTokens: 4096 },
};
const DEEPL: ProviderConfig = { id: "deepl", options: {} };
const SELF_HOSTED: ProviderConfig = {
  id: "openai-compatible",
  options: { baseUrl: "http://localhost:1234/v1", model: "llama-3", maxOutputTokens: 4096 },
};

const ENTRY = { key: "greeting", namespace: "", value: "Hello world", placeholders: [] };
const PLAIN_ENTRY = { ...ENTRY, isPlural: false };

function run(provider: ProviderConfig, table: Record<string, unknown> = {}): RunEstimate {
  return estimateRun({
    provider,
    sourceLocale: "en",
    maxBatchSize: 50,
    locales: [{ locale: "de", entries: [PLAIN_ENTRY], generatedEntries: [] }],
    rates: rateCardSchema.parse({ asOf: "2026-01-15", currency: "USD", table }),
  });
}

const PRICED_SHAPE: PricedRunEstimate = {
  provider: "anthropic",
  model: "sonnet-test",
  rateKey: "anthropic/sonnet-test",
  unit: "tokens",
  keys: 1,
  requests: 1,
  inputTokens: 373,
  outputTokens: 15,
  caveats: ["CACHE_NOT_CONSULTED"],
  pricing: "priced",
  currency: "USD",
  asOf: "2026-01-15",
  locales: [{ locale: "de", keys: 1, requests: 1, inputTokens: 373, outputTokens: 15, cost: 1 }],
  cost: 1,
};

describe("a priced estimate without a figure does not typecheck", () => {
  it("refuses a priced run that omits the cost", () => {
    const { cost: _cost, ...withoutCost } = PRICED_SHAPE;
    // @ts-expect-error a priced estimate must carry a cost
    const broken: PricedRunEstimate = withoutCost;

    expect(broken.pricing).toBe("priced");
  });

  it("refuses a priced run that omits the currency the cost is written in", () => {
    const { currency: _currency, ...withoutCurrency } = PRICED_SHAPE;
    // @ts-expect-error a priced estimate must name the currency
    const broken: PricedRunEstimate = withoutCurrency;

    expect(broken.pricing).toBe("priced");
  });

  it("refuses a priced run that omits the date the rates were read", () => {
    const { asOf: _asOf, ...withoutAsOf } = PRICED_SHAPE;
    // @ts-expect-error a priced estimate must carry the rate card's asOf
    const broken: PricedRunEstimate = withoutAsOf;

    expect(broken.pricing).toBe("priced");
  });

  it("refuses a priced run whose per-locale breakdown carries no figure", () => {
    const broken: PricedRunEstimate = {
      ...PRICED_SHAPE,
      // @ts-expect-error every locale of a priced run carries a cost
      locales: [{ locale: "de", keys: 1, requests: 1, inputTokens: 373, outputTokens: 15 }],
    };

    expect(broken.locales).toHaveLength(1);
  });

  it("refuses an unpriced run that smuggles a figure in anyway", () => {
    const broken: UnpricedRunEstimate = {
      ...PRICED_SHAPE,
      pricing: "no-rate-on-file",
      locales: [{ locale: "de", keys: 1, requests: 1, inputTokens: 373, outputTokens: 15 }],
      // @ts-expect-error an unpriced estimate has no cost to report
      cost: 1,
    };

    expect(broken.pricing).toBe("no-rate-on-file");
  });

  it("narrows a run estimate to a definite number once pricing is priced", () => {
    const estimate = run(ANTHROPIC, {
      "anthropic/sonnet-test": { inputPerMillionTokens: 3, outputPerMillionTokens: 15 },
    });
    if (estimate.pricing !== "priced") {
      throw new Error("expected a priced estimate");
    }

    expectTypeOf(estimate.cost).toEqualTypeOf<number>();
    expectTypeOf(estimate.currency).toEqualTypeOf<string>();
    expectTypeOf(estimate.asOf).toEqualTypeOf<string>();
    expect(estimate.cost).toBeGreaterThan(0);
  });

  it("narrows a locale estimate the same way, so no locale can be priced alone", () => {
    const locale: LocaleEstimate = {
      locale: "de",
      keys: 1,
      requests: 1,
      inputTokens: 373,
      outputTokens: 15,
      cost: 2,
    };
    if (locale.cost === undefined) {
      throw new Error("expected a priced locale");
    }

    expectTypeOf(locale).toEqualTypeOf<PricedLocaleEstimate>();
    expect(locale.cost).toBe(2);
  });
});

describe("a branch that carries no figure carries no field for one either", () => {
  it("leaves cost, currency and asOf off an estimate with no rate on file", () => {
    const estimate = run(ANTHROPIC);

    expect(estimate.pricing).toBe("no-rate-on-file");
    expect(estimate).not.toHaveProperty("cost");
    expect(estimate).not.toHaveProperty("currency");
    expect(estimate).not.toHaveProperty("asOf");
    expect(estimate.locales[0]).not.toHaveProperty("cost");
  });

  it("leaves them off a rate refused for being written in the wrong unit", () => {
    const estimate = run(ANTHROPIC, { "anthropic/sonnet-test": { perMillionCharacters: 25 } });

    expect(estimate.pricing).toBe("rate-unit-mismatch");
    expect(estimate).not.toHaveProperty("cost");
    expect(estimate).not.toHaveProperty("currency");
  });

  it("leaves them off a self-hosted endpoint no API bills for", () => {
    const estimate = run(SELF_HOSTED, {
      "openai-compatible/llama-3": { inputPerMillionTokens: 3, outputPerMillionTokens: 15 },
    });

    expect(estimate.pricing).toBe("not-billed");
    expect(estimate).not.toHaveProperty("cost");
    expect(estimate).not.toHaveProperty("asOf");
  });
});

describe("a billing unit carries only the fields it bills by", () => {
  it("gives a character-billed provider no token field at all, not even an undefined one", () => {
    const estimate = run(DEEPL, { deepl: { perMillionCharacters: 25 } });

    expect(estimate.unit).toBe("characters");
    expect(estimate).not.toHaveProperty("inputTokens");
    expect(estimate).not.toHaveProperty("outputTokens");
    expect(estimate.locales[0]).not.toHaveProperty("inputTokens");
    expect(estimate.locales[0]).not.toHaveProperty("outputTokens");
  });

  it("gives a token-billed provider no character field", () => {
    const estimate = run(ANTHROPIC, {
      "anthropic/sonnet-test": { inputPerMillionTokens: 3, outputPerMillionTokens: 15 },
    });

    expect(estimate.unit).toBe("tokens");
    expect(estimate).not.toHaveProperty("sourceCharacters");
    expect(estimate.locales[0]).not.toHaveProperty("sourceCharacters");
  });

  it("keeps the unit consistent between the run and every locale of it", () => {
    const characters = run(DEEPL, { deepl: { perMillionCharacters: 25 } });
    const tokens = run(ANTHROPIC);

    expect(Object.keys(characters.locales[0] ?? {}).sort()).toEqual([
      "cost",
      "keys",
      "locale",
      "requests",
      "sourceCharacters",
    ]);
    expect(Object.keys(tokens.locales[0] ?? {}).sort()).toEqual([
      "inputTokens",
      "keys",
      "locale",
      "outputTokens",
      "requests",
    ]);
  });
});
