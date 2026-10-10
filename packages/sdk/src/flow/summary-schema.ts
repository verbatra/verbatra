import { type ProviderNoticeCode, REVIEW_REASON_CODES } from "@verbatra/ai-providers";
import { z } from "zod";
import { MANIFEST_PROVIDER_IDS } from "./data-flow-manifest.js";
import { INTEGRITY_GATE_REASONS } from "./integrity-gate.js";
import type {
  EstimateCaveatCode,
  EstimatePricing,
  ProtectionReason,
  SdkNoticeCode,
  SuggestionStatus,
} from "./summary.js";

const PROVIDER_NOTICE_CODES = [
  "FORMALITY_DOWNGRADED",
  "GLOSSARY_IGNORED",
  "PLACEHOLDER_UNSUPPORTED",
] as const satisfies readonly ProviderNoticeCode[];

const SDK_NOTICE_CODES = [
  "PLURAL_CATEGORIES_INCOMPLETE",
  "SUB_BATCH_FAILED",
  "BLANK_ROW_BASELINE_RETAINED",
  "HANDOFF_REVIEWS_RECORDED",
  "BUDGET_TOKENS_EXCEEDED",
  "CACHE_VERSION_UNRECOGNIZED",
  "PROVENANCE_VERSION_UNRECOGNIZED",
  "PROVENANCE_FILE_TOO_LARGE",
  "LOCALE_STATE_CARRIED_OVER",
  "LOCALE_STATE_CARRY_OVER_SKIPPED",
  "LOCALE_UNVERIFIED_BY_PROVIDER",
  "LOCALE_NOT_WELL_TESTED",
  "GLOSSARY_UNSUPPORTED_BY_PROVIDER",
  "FORMALITY_UNSUPPORTED_BY_PROVIDER",
  "SOURCE_FOREIGN_PLACEHOLDERS",
  "SOURCE_VALUE_EMPTY",
  "SENSITIVE_CONTENT_SENT",
  "SENSITIVE_CONTENT_REDACTED",
  "SENSITIVE_CONTENT_WITHHELD",
  "RUN_CANCELLED",
] as const satisfies readonly SdkNoticeCode[];

const ESTIMATE_CAVEAT_CODES = [
  "CACHE_NOT_CONSULTED",
  "SOURCE_DUPLICATES_NOT_DEDUPLICATED",
  "TRANSPORT_RETRIES_NOT_COUNTED",
  "TRANSLATION_LENGTH_IS_ESTIMATED",
  "TOKEN_COUNT_IS_HEURISTIC",
  "REPAIR_REQUESTS_NOT_COUNTED",
] as const satisfies readonly EstimateCaveatCode[];

const UNPRICED_ESTIMATES = [
  "no-rate-on-file",
  "rate-unit-mismatch",
  "not-billed",
] as const satisfies readonly Exclude<EstimatePricing, "priced">[];

const PROTECTION_REASONS = [
  "human",
  "import",
  "external",
  "pinned",
] as const satisfies readonly ProtectionReason[];

const SUGGESTION_STATUSES = [
  "planned",
  "suggested",
  "integrity-mismatch",
  "provider-failure",
  "budget-withheld",
  "sensitive-withheld",
] as const satisfies readonly SuggestionStatus[];

const keyListSchema = z.array(z.string()).readonly();
const absent = z.undefined().exactOptional();

export const reviewReasonCodeSchema = z.enum(REVIEW_REASON_CODES);

export const integrityGateReasonSchema = z.enum(INTEGRITY_GATE_REASONS);

export const usageSummarySchema = z.object({
  inputTokens: z.number(),
  outputTokens: z.number(),
});

export const runBudgetSchema = z.object({
  maxTokens: z.number(),
  behavior: z.enum(["warn", "stop"]),
  supported: z.boolean(),
  tokensUsed: z.number(),
  exceeded: z.boolean(),
});

const localeEstimateQuantity = {
  locale: z.string(),
  keys: z.number(),
  requests: z.number(),
  inputTokens: z.number().exactOptional(),
  outputTokens: z.number().exactOptional(),
  sourceCharacters: z.number().exactOptional(),
};

const pricedLocaleEstimateSchema = z.object({ ...localeEstimateQuantity, cost: z.number() });
const unpricedLocaleEstimateSchema = z.object({ ...localeEstimateQuantity, cost: absent });

const estimateIdentity = {
  provider: z.enum(MANIFEST_PROVIDER_IDS),
  model: z.string().exactOptional(),
  rateKey: z.string(),
  keys: z.number(),
  requests: z.number(),
  caveats: z.array(z.enum(ESTIMATE_CAVEAT_CODES)).readonly(),
};

const tokenQuantity = {
  unit: z.literal("tokens"),
  inputTokens: z.number(),
  outputTokens: z.number(),
  sourceCharacters: absent,
};

const characterQuantity = {
  unit: z.literal("characters"),
  sourceCharacters: z.number(),
  inputTokens: absent,
  outputTokens: absent,
};

const pricedMoney = {
  pricing: z.literal("priced"),
  currency: z.string(),
  asOf: z.string(),
  locales: z.array(pricedLocaleEstimateSchema).readonly(),
  cost: z.number(),
};

const unpricedMoney = {
  pricing: z.enum(UNPRICED_ESTIMATES),
  locales: z.array(unpricedLocaleEstimateSchema).readonly(),
  currency: absent,
  asOf: absent,
  cost: absent,
};

export const runEstimateSchema = z.union([
  z.object({ ...estimateIdentity, ...tokenQuantity, ...pricedMoney }),
  z.object({ ...estimateIdentity, ...characterQuantity, ...pricedMoney }),
  z.object({ ...estimateIdentity, ...tokenQuantity, ...unpricedMoney }),
  z.object({ ...estimateIdentity, ...characterQuantity, ...unpricedMoney }),
]);

export const needsReviewEntrySchema = z.object({
  key: z.string(),
  reasons: z.array(reviewReasonCodeSchema).readonly(),
});

export const fuzzyCacheHitSchema = z.object({
  key: z.string(),
  previousSource: z.string(),
  similarity: z.number(),
});

export const integrityRefusalSchema = z.object({
  key: z.string(),
  reason: integrityGateReasonSchema,
  details: keyListSchema.exactOptional(),
});

export const protectedKeySchema = z.object({
  key: z.string(),
  reason: z.enum(PROTECTION_REASONS),
  suggestion: z.string().exactOptional(),
  suggestionStatus: z.enum(SUGGESTION_STATUSES).exactOptional(),
});

const localeNoticeSchema = z.union([
  z.object({ code: z.enum(PROVIDER_NOTICE_CODES), message: z.string() }),
  z.object({ code: z.enum(SDK_NOTICE_CODES), message: z.string() }),
]);

/**
 * The zod 4 schema for a {@link LocaleSummary}, one locale of a {@link RunSummary}. `parse`
 * accepts fields it does not list and strips them from its result.
 */
export const localeSummarySchema = z.object({
  locale: z.string(),
  status: z.enum(["succeeded", "partial", "failed"]),
  translated: keyListSchema,
  unchanged: keyListSchema,
  orphaned: keyListSchema,
  pruned: keyListSchema,
  invalidIcuSource: keyListSchema,
  emptySource: keyListSchema.exactOptional(),
  cacheHits: keyListSchema,
  fuzzyHits: z.array(fuzzyCacheHitSchema).readonly(),
  integrityMismatches: keyListSchema,
  integrityRefusals: z.array(integrityRefusalSchema).readonly().exactOptional(),
  providerFailures: keyListSchema,
  generated: keyListSchema,
  budgetWithheld: keyListSchema,
  sensitiveWithheld: keyListSchema,
  usage: usageSummarySchema.exactOptional(),
  notices: z.array(localeNoticeSchema).readonly(),
  needsReview: z.array(needsReviewEntrySchema).readonly(),
  unfilled: keyListSchema,
  protected: z.array(protectedKeySchema).readonly(),
  malformedRows: z
    .array(z.object({ row: z.number(), line: z.number().exactOptional(), column: z.string() }))
    .readonly(),
  duplicateKeys: z
    .array(z.object({ key: z.string(), row: z.number(), line: z.number().exactOptional() }))
    .readonly(),
  error: z.object({ code: z.string(), message: z.string() }).exactOptional(),
});

/**
 * The zod schema for a {@link RunSummary}, the `result` of `verbatra translate`, `watch` and
 * `import` under `--json`.
 * A zod 4 schema: `parse` accepts fields it does not list and strips them from its result.
 */
export const runSummarySchema = z.object({
  dryRun: z.boolean(),
  locales: z.array(localeSummarySchema).readonly(),
  succeeded: keyListSchema,
  partial: keyListSchema,
  failed: keyListSchema,
  usage: usageSummarySchema.exactOptional(),
  budget: runBudgetSchema.exactOptional(),
  estimate: runEstimateSchema.exactOptional(),
  cancelled: z.literal(true).exactOptional(),
});
