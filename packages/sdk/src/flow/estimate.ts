import { dataPayloadCharacters, resultPayloadCharacters, type Tone } from "@verbatra/ai-providers";
import type { LocaleResource, TranslationEntry } from "@verbatra/core";
import { type BillingUnit, billingFor, modelOf, rateKeyFor } from "../config/provider-billing.js";
import type { ProviderConfig } from "../config/provider-config.js";
import { isTokenRate, lookupRate, type ModelRate, type RateCard } from "../config/rate-card.js";
import type { VerbatraConfig } from "../config/schema.js";
import { chunk } from "./batching.js";
import { planPluralGeneration, syntheticEntry } from "./plural-categories.js";
import type {
  CharacterRunQuantity,
  EstimateCaveatCode,
  EstimateIdentity,
  EstimatePricing,
  LocaleEstimateQuantity,
  LocaleSummary,
  PricedLocaleEstimate,
  RunEstimate,
  RunEstimateQuantity,
  TokenRunQuantity,
  UnpricedLocaleEstimate,
} from "./summary.js";

export const ESTIMATED_CHARACTERS_PER_TOKEN = 4;
export const ESTIMATED_SYSTEM_RULES_TOKENS = 250;
export const ESTIMATED_RESPONSE_SCHEMA_TOKENS = 100;
export const ESTIMATED_TRANSLATION_EXPANSION = 1.5;

const PER_MILLION = 1_000_000;

export interface LocaleEstimateInput {
  readonly locale: string;
  readonly entries: readonly TranslationEntry[];
  readonly generatedEntries: readonly TranslationEntry[];
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

export interface PayloadContextSource {
  readonly sourceLocale: string;
  readonly targetLocale: string;
  readonly glossary?: Readonly<Record<string, string>> | undefined;
  readonly tone?: Tone | undefined;
}

export function payloadContextOf(source: PayloadContextSource): PayloadContext {
  return {
    sourceLocale: source.sourceLocale,
    targetLocale: source.targetLocale,
    ...(source.glossary !== undefined ? { glossary: source.glossary } : {}),
    ...(source.tone !== undefined ? { tone: source.tone } : {}),
  };
}

function expansionAllowance(batch: readonly TranslationEntry[]): number {
  let allowance = 0;
  for (const entry of batch) {
    allowance += Math.ceil(entry.value.length * (ESTIMATED_TRANSLATION_EXPANSION - 1));
  }
  return allowance;
}

export function quantifyBatch(
  batch: readonly TranslationEntry[],
  context: PayloadContext,
): EstimatedQuantity {
  const prompt = dataPayloadCharacters({ ...context, entries: batch });
  const response =
    resultPayloadCharacters(batch.map((entry) => ({ key: entry.key, value: entry.value }))) +
    expansionAllowance(batch);
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

type Pricing =
  | {
      readonly status: "priced";
      readonly rate: ModelRate;
      readonly currency: string;
      readonly asOf: string;
    }
  | { readonly status: Exclude<EstimatePricing, "priced"> };

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
    "TRANSPORT_RETRIES_NOT_COUNTED",
  ];
  return unit === "tokens"
    ? [
        ...shared,
        "TRANSLATION_LENGTH_IS_ESTIMATED",
        "TOKEN_COUNT_IS_HEURISTIC",
        "REPAIR_REQUESTS_NOT_COUNTED",
      ]
    : shared;
}

function localeQuantityFields(
  quantity: EstimatedQuantity,
  unit: BillingUnit,
): Pick<LocaleEstimateQuantity, "inputTokens" | "outputTokens" | "sourceCharacters"> {
  return unit === "tokens"
    ? { inputTokens: quantity.inputTokens, outputTokens: quantity.outputTokens }
    : { sourceCharacters: quantity.sourceCharacters };
}

type RunQuantityFields =
  | Pick<TokenRunQuantity, "unit" | "inputTokens" | "outputTokens">
  | Pick<CharacterRunQuantity, "unit" | "sourceCharacters">;

function runQuantityFields(quantity: EstimatedQuantity, unit: BillingUnit): RunQuantityFields {
  return unit === "tokens"
    ? { unit, inputTokens: quantity.inputTokens, outputTokens: quantity.outputTokens }
    : { unit: "characters", sourceCharacters: quantity.sourceCharacters };
}

function localeQuantityOf(
  locale: string,
  quantity: EstimatedQuantity,
  unit: BillingUnit,
): LocaleEstimateQuantity {
  return {
    locale,
    keys: quantity.keys,
    requests: quantity.requests,
    ...localeQuantityFields(quantity, unit),
  };
}

function quantifyEverySend(
  locale: LocaleEstimateInput,
  context: PayloadContext,
  maxBatchSize: number,
): EstimatedQuantity {
  return addQuantities(
    quantifyLocale(locale.entries, context, maxBatchSize),
    quantifyLocale(locale.generatedEntries, context, maxBatchSize),
  );
}

interface MeasuredLocale {
  readonly quantity: EstimatedQuantity;
  readonly estimate: LocaleEstimateQuantity;
}

function measureLocales(input: EstimateRunInput, unit: BillingUnit): readonly MeasuredLocale[] {
  return input.locales.map((locale) => {
    const quantity = quantifyEverySend(
      locale,
      payloadContextOf({ ...input, targetLocale: locale.locale }),
      input.maxBatchSize,
    );
    return { quantity, estimate: localeQuantityOf(locale.locale, quantity, unit) };
  });
}

export function estimateRun(input: EstimateRunInput): RunEstimate {
  const { unit } = billingFor(input.provider.id);
  const pricing = resolvePricing(input, unit);
  const measured = measureLocales(input, unit);
  const total = measured.reduce((sum, item) => addQuantities(sum, item.quantity), EMPTY);
  const model = modelOf(input.provider);
  const identity: EstimateIdentity = {
    provider: input.provider.id,
    ...(model !== undefined ? { model } : {}),
    rateKey: rateKeyFor(input.provider),
    keys: total.keys,
    requests: total.requests,
    caveats: caveatsFor(unit),
  };
  const shared: RunEstimateQuantity = { ...identity, ...runQuantityFields(total, unit) };

  if (pricing.status !== "priced") {
    return {
      ...shared,
      pricing: pricing.status,
      locales: measured.map((item): UnpricedLocaleEstimate => item.estimate),
    };
  }
  const rate = pricing.rate;
  return {
    ...shared,
    pricing: "priced",
    currency: pricing.currency,
    asOf: pricing.asOf,
    locales: measured.map(
      (item): PricedLocaleEstimate => ({ ...item.estimate, cost: costOf(item.quantity, rate) }),
    ),
    cost: costOf(total, rate),
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

function generatedEntriesFor(
  input: EstimateForRunInput,
  summary: LocaleSummary,
): readonly TranslationEntry[] {
  if (summary.generated.length === 0) {
    return [];
  }
  const planned = new Map(
    planPluralGeneration(input.source, summary.locale, input.config.format).items.map((item) => [
      item.targetKey,
      item,
    ]),
  );
  const entries: TranslationEntry[] = [];
  for (const key of summary.generated) {
    const item = planned.get(key);
    /* v8 ignore next 3 -- a summary's generated keys come from the same plan this rebuilds from the same source, so every one of them resolves; this guard is purely defensive. */
    if (item === undefined) {
      continue;
    }
    entries.push(syntheticEntry(item));
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
      generatedEntries: generatedEntriesFor(input, summary),
    })),
  });
}
