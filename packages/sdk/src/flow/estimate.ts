import type { LocaleResource, TranslationEntry } from "@verbatra/core";
import { type BillingUnit, billingFor, modelOf, rateKeyFor } from "../config/provider-billing.js";
import type { ProviderConfig } from "../config/provider-config.js";
import { isTokenRate, lookupRate, type ModelRate, type RateCard } from "../config/rate-card.js";
import type { VerbatraConfig } from "../config/schema.js";
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

const PROMPT_ITEM_PUNCTUATION_CHARACTERS = 20;
const RESPONSE_ITEM_PUNCTUATION_CHARACTERS = 15;
const PER_MILLION = 1_000_000;

export interface LocaleEstimateInput {
  readonly locale: string;
  readonly entries: readonly TranslationEntry[];
}

export interface EstimateRunInput {
  readonly provider: ProviderConfig;
  readonly maxBatchSize: number;
  readonly locales: readonly LocaleEstimateInput[];
  readonly rates?: RateCard;
}

interface Quantity {
  readonly keys: number;
  readonly requests: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly sourceCharacters: number;
}

function toTokens(characters: number): number {
  return Math.ceil(characters / ESTIMATED_CHARACTERS_PER_TOKEN);
}

function promptCharacters(entry: TranslationEntry): number {
  return (
    entry.key.length +
    entry.value.length +
    (entry.description?.length ?? 0) +
    (entry.meaning?.length ?? 0) +
    PROMPT_ITEM_PUNCTUATION_CHARACTERS
  );
}

function responseCharacters(entry: TranslationEntry): number {
  return entry.key.length + entry.value.length + RESPONSE_ITEM_PUNCTUATION_CHARACTERS;
}

export function quantifyLocale(
  entries: readonly TranslationEntry[],
  maxBatchSize: number,
): Quantity {
  const requests = Math.ceil(entries.length / maxBatchSize);
  let prompt = 0;
  let response = 0;
  let sourceCharacters = 0;
  for (const entry of entries) {
    prompt += promptCharacters(entry);
    response += responseCharacters(entry);
    sourceCharacters += entry.value.length;
  }
  const overhead = requests * (ESTIMATED_SYSTEM_RULES_TOKENS + ESTIMATED_RESPONSE_SCHEMA_TOKENS);
  return {
    keys: entries.length,
    requests,
    inputTokens: overhead + toTokens(prompt),
    outputTokens: toTokens(response),
    sourceCharacters,
  };
}

function addQuantities(total: Quantity, next: Quantity): Quantity {
  return {
    keys: total.keys + next.keys,
    requests: total.requests + next.requests,
    inputTokens: total.inputTokens + next.inputTokens,
    outputTokens: total.outputTokens + next.outputTokens,
    sourceCharacters: total.sourceCharacters + next.sourceCharacters,
  };
}

const EMPTY: Quantity = {
  keys: 0,
  requests: 0,
  inputTokens: 0,
  outputTokens: 0,
  sourceCharacters: 0,
};

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

function costOf(quantity: Quantity, rate: ModelRate): number {
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
  quantity: Quantity,
  unit: BillingUnit,
): Pick<LocaleEstimate, "inputTokens" | "outputTokens" | "sourceCharacters"> {
  return unit === "tokens"
    ? { inputTokens: quantity.inputTokens, outputTokens: quantity.outputTokens }
    : { sourceCharacters: quantity.sourceCharacters };
}

function costFields(quantity: Quantity, pricing: Pricing): { cost?: number } {
  return pricing.rate === undefined ? {} : { cost: costOf(quantity, pricing.rate) };
}

function datedFields(pricing: Pricing): { currency?: string; asOf?: string } {
  return pricing.currency === undefined || pricing.asOf === undefined
    ? {}
    : { currency: pricing.currency, asOf: pricing.asOf };
}

function localeEstimateOf(
  locale: LocaleEstimateInput,
  quantity: Quantity,
  unit: BillingUnit,
  pricing: Pricing,
): LocaleEstimate {
  return {
    locale: locale.locale,
    keys: quantity.keys,
    requests: quantity.requests,
    ...quantityFields(quantity, unit),
    ...costFields(quantity, pricing),
  };
}

export function estimateRun(input: EstimateRunInput): RunEstimate {
  const { unit } = billingFor(input.provider.id);
  const pricing = resolvePricing(input, unit);
  const measured = input.locales.map((locale) => ({
    locale,
    quantity: quantifyLocale(locale.entries, input.maxBatchSize),
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

export function estimateForRun(input: EstimateForRunInput): RunEstimate {
  return estimateRun({
    provider: input.config.provider,
    maxBatchSize: input.maxBatchSize,
    ...(input.config.rates !== undefined ? { rates: input.config.rates } : {}),
    locales: input.summaries.map((summary) => ({
      locale: summary.locale,
      entries: summary.translated.flatMap((key) => {
        const entry = input.source.entries.get(key);
        return entry === undefined ? [] : [entry];
      }),
    })),
  });
}
