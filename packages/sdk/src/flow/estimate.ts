import { dataPayloadCharacters, resultPayloadCharacters, type Tone } from "@verbatra/ai-providers";
import type { LocaleResource, TranslationEntry } from "@verbatra/core";
import { type BillingUnit, billingFor, modelOf, rateKeyFor } from "../config/provider-billing.js";
import type { ProviderConfig } from "../config/provider-config.js";
import { isTokenRate, lookupRate, type ModelRate, type RateCard } from "../config/rate-card.js";
import type { VerbatraConfig } from "../config/schema.js";
import { chunk } from "./batching.js";
import type {
  EstimateCaveatCode,
  EstimatePricing,
  LocaleEstimate,
  LocaleSummary,
  RunEstimate,
} from "./summary.js";

export const ESTIMATED_CHARACTERS_PER_TOKEN = 4;
export const ESTIMATED_SYSTEM_RULES_TOKENS = 250;
export const ESTIMATED_RESPONSE_SCHEMA_TOKENS = 100;

const PER_MILLION = 1_000_000;

export interface LocaleEstimateInput {
  readonly locale: string;
  readonly entries: readonly TranslationEntry[];
}

export interface EstimateRunInput {
  readonly provider: ProviderConfig;
  readonly sourceLocale: string;
  readonly maxBatchSize: number;
  readonly locales: readonly LocaleEstimateInput[];
  readonly glossary?: Readonly<Record<string, string>>;
  readonly tone?: Tone;
  readonly rates?: RateCard;
}

export interface EstimatedQuantity {
  readonly keys: number;
  readonly requests: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly sourceCharacters: number;
}

const EMPTY: EstimatedQuantity = {
  keys: 0,
  requests: 0,
  inputTokens: 0,
  outputTokens: 0,
  sourceCharacters: 0,
};

function toTokens(characters: number): number {
  return Math.ceil(characters / ESTIMATED_CHARACTERS_PER_TOKEN);
}

function addQuantities(total: EstimatedQuantity, next: EstimatedQuantity): EstimatedQuantity {
  return {
    keys: total.keys + next.keys,
    requests: total.requests + next.requests,
    inputTokens: total.inputTokens + next.inputTokens,
    outputTokens: total.outputTokens + next.outputTokens,
    sourceCharacters: total.sourceCharacters + next.sourceCharacters,
  };
}

export interface PayloadContext {
  readonly sourceLocale: string;
  readonly targetLocale: string;
  readonly glossary?: Readonly<Record<string, string>>;
  readonly tone?: Tone;
}

function quantifyBatch(
  batch: readonly TranslationEntry[],
  context: PayloadContext,
): EstimatedQuantity {
  const prompt = dataPayloadCharacters({ ...context, entries: batch });
  const response = resultPayloadCharacters(
    batch.map((entry) => ({ key: entry.key, value: entry.value })),
  );
  let sourceCharacters = 0;
  for (const entry of batch) {
    sourceCharacters += entry.value.length;
  }
  return {
    keys: batch.length,
    requests: 1,
    inputTokens:
      ESTIMATED_SYSTEM_RULES_TOKENS + ESTIMATED_RESPONSE_SCHEMA_TOKENS + toTokens(prompt),
    outputTokens: toTokens(response),
    sourceCharacters,
  };
}

export function quantifyLocale(
  entries: readonly TranslationEntry[],
  context: PayloadContext,
  maxBatchSize: number,
): EstimatedQuantity {
  return chunk(entries, maxBatchSize).reduce(
    (total, batch) => addQuantities(total, quantifyBatch(batch, context)),
    EMPTY,
  );
}

interface Pricing {
  readonly status: EstimatePricing;
  readonly rate?: ModelRate;
  readonly currency?: string;
  readonly asOf?: string;
}

function resolvePricing(input: EstimateRunInput, unit: BillingUnit): Pricing {
  if (!billingFor(input.provider.id).billedByApi) {
    return { status: "not-billed" };
  }
  const card = input.rates;
  const rate = lookupRate(card, rateKeyFor(input.provider));
  if (card === undefined || rate === undefined) {
    return { status: "no-rate-on-file" };
  }
  if (isTokenRate(rate) !== (unit === "tokens")) {
    return { status: "rate-unit-mismatch" };
  }
  return { status: "priced", rate, currency: card.currency, asOf: card.asOf };
}

function costOf(quantity: EstimatedQuantity, rate: ModelRate): number {
  if (isTokenRate(rate)) {
    return (
      (quantity.inputTokens * rate.inputPerMillionTokens) / PER_MILLION +
      (quantity.outputTokens * rate.outputPerMillionTokens) / PER_MILLION
    );
  }
  return (quantity.sourceCharacters * rate.perMillionCharacters) / PER_MILLION;
}

function caveatsFor(unit: BillingUnit): readonly EstimateCaveatCode[] {
  const shared: readonly EstimateCaveatCode[] = [
    "CACHE_NOT_CONSULTED",
    "SOURCE_DUPLICATES_NOT_DEDUPLICATED",
  ];
  return unit === "tokens"
    ? [...shared, "TOKEN_COUNT_IS_HEURISTIC", "REPAIR_REQUESTS_NOT_COUNTED"]
    : shared;
}

function quantityFields(
  quantity: EstimatedQuantity,
  unit: BillingUnit,
): Pick<LocaleEstimate, "inputTokens" | "outputTokens" | "sourceCharacters"> {
  return unit === "tokens"
    ? { inputTokens: quantity.inputTokens, outputTokens: quantity.outputTokens }
    : { sourceCharacters: quantity.sourceCharacters };
}

function costFields(quantity: EstimatedQuantity, pricing: Pricing): { cost?: number } {
  return pricing.rate === undefined ? {} : { cost: costOf(quantity, pricing.rate) };
}

function datedFields(pricing: Pricing): { currency?: string; asOf?: string } {
  return pricing.currency === undefined || pricing.asOf === undefined
    ? {}
    : { currency: pricing.currency, asOf: pricing.asOf };
}

function localeEstimateOf(
  locale: string,
  quantity: EstimatedQuantity,
  unit: BillingUnit,
  pricing: Pricing,
): LocaleEstimate {
  return {
    locale,
    keys: quantity.keys,
    requests: quantity.requests,
    ...quantityFields(quantity, unit),
    ...costFields(quantity, pricing),
  };
}

function contextFor(input: EstimateRunInput, targetLocale: string): PayloadContext {
  return {
    sourceLocale: input.sourceLocale,
    targetLocale,
    ...(input.glossary !== undefined ? { glossary: input.glossary } : {}),
    ...(input.tone !== undefined ? { tone: input.tone } : {}),
  };
}

export function estimateRun(input: EstimateRunInput): RunEstimate {
  const { unit } = billingFor(input.provider.id);
  const pricing = resolvePricing(input, unit);
  const measured = input.locales.map((locale) => ({
    locale: locale.locale,
    quantity: quantifyLocale(locale.entries, contextFor(input, locale.locale), input.maxBatchSize),
  }));
  const total = measured.reduce((sum, item) => addQuantities(sum, item.quantity), EMPTY);
  const model = modelOf(input.provider);

  return {
    provider: input.provider.id,
    ...(model !== undefined ? { model } : {}),
    rateKey: rateKeyFor(input.provider),
    unit,
    pricing: pricing.status,
    ...datedFields(pricing),
    locales: measured.map((item) => localeEstimateOf(item.locale, item.quantity, unit, pricing)),
    keys: total.keys,
    requests: total.requests,
    ...quantityFields(total, unit),
    ...costFields(total, pricing),
    caveats: caveatsFor(unit),
  };
}

export interface EstimateForRunInput {
  readonly summaries: readonly LocaleSummary[];
  readonly source: LocaleResource;
  readonly config: VerbatraConfig;
  readonly maxBatchSize: number;
}

function entriesFor(source: LocaleResource, keys: readonly string[]): readonly TranslationEntry[] {
  const entries: TranslationEntry[] = [];
  for (const key of keys) {
    const entry = source.entries.get(key);
    /* v8 ignore next 3 -- a summary's translated keys come from the source-driven diff, so every one of them resolves to a source entry; this guard is purely defensive. */
    if (entry === undefined) {
      continue;
    }
    entries.push(entry);
  }
  return entries;
}

export function estimateForRun(input: EstimateForRunInput): RunEstimate {
  const config = input.config;
  return estimateRun({
    provider: config.provider,
    sourceLocale: config.sourceLocale,
    maxBatchSize: input.maxBatchSize,
    ...(config.glossary !== undefined ? { glossary: config.glossary } : {}),
    ...(config.tone !== undefined ? { tone: config.tone } : {}),
    ...(config.rates !== undefined ? { rates: config.rates } : {}),
    locales: input.summaries.map((summary) => ({
      locale: summary.locale,
      entries: entriesFor(input.source, summary.translated),
    })),
  });
}
