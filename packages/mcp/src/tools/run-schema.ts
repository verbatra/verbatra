import { REVIEW_REASON_CODES, type ValueMarker } from "@verbatra/sdk";
import { z } from "zod";
import { integrityGateReasonSchema } from "./integrity-gate-reason.js";
import { keyProvenanceSchema } from "./provenance-schema.js";
import { markFields } from "./value-redaction.js";

export const reviewReasonCodeSchema = z.enum(REVIEW_REASON_CODES);

export const usageSchema = z.object({
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

const localeRunStatusSchema = z.enum(["succeeded", "partial", "failed"]);

export const needsReviewEntrySchema = z.object({
  key: z.string(),
  reasons: z.array(reviewReasonCodeSchema).readonly(),
});

export const reviewQueueEntrySchema = needsReviewEntrySchema.extend({
  provenance: keyProvenanceSchema,
});

export const fuzzyCacheHitSchema = z.object({
  key: z.string(),
  previousSource: z.string(),
  similarity: z.number(),
});

const keyListSchema = z.array(z.string()).readonly();

export const integrityRefusalSchema = z.object({
  key: z.string(),
  reason: integrityGateReasonSchema,
  details: z.array(z.string()).readonly().optional(),
});

const protectedKeySchema = z.object({
  key: z.string(),
  reason: z.enum(["human", "import", "external", "pinned"]),
  suggestion: z.string().optional(),
  suggestionStatus: z
    .enum([
      "planned",
      "suggested",
      "integrity-mismatch",
      "provider-failure",
      "budget-withheld",
      "sensitive-withheld",
    ])
    .optional(),
});

const localeSummarySchema = z.object({
  locale: z.string(),
  status: localeRunStatusSchema,
  translated: keyListSchema,
  unchanged: keyListSchema,
  orphaned: keyListSchema,
  pruned: keyListSchema,
  invalidIcuSource: keyListSchema,
  cacheHits: keyListSchema,
  fuzzyHits: z.array(fuzzyCacheHitSchema).readonly(),
  integrityMismatches: keyListSchema,
  integrityRefusals: z.array(integrityRefusalSchema).readonly().optional(),
  providerFailures: keyListSchema,
  generated: keyListSchema,
  budgetWithheld: keyListSchema,
  sensitiveWithheld: keyListSchema,
  usage: usageSchema.optional(),
  notices: z.array(z.object({ code: z.string(), message: z.string() })).readonly(),
  needsReview: z.array(needsReviewEntrySchema).readonly(),
  unfilled: keyListSchema,
  protected: z.array(protectedKeySchema).readonly(),
  malformedRows: z
    .array(z.object({ row: z.number(), line: z.number().optional(), column: z.string() }))
    .readonly(),
  duplicateKeys: z
    .array(z.object({ key: z.string(), row: z.number(), line: z.number().optional() }))
    .readonly(),
  error: z.object({ code: z.string(), message: z.string() }).optional(),
});

export const runSummarySchema = z.object({
  dryRun: z.boolean(),
  locales: z.array(localeSummarySchema).readonly(),
  succeeded: keyListSchema,
  partial: keyListSchema,
  failed: keyListSchema,
  usage: usageSchema.optional(),
  budget: runBudgetSchema.optional(),
});

type FuzzyCacheHit = z.infer<typeof fuzzyCacheHitSchema>;

type LocaleSummary = z.infer<typeof localeSummarySchema>;

type RunSummary = z.infer<typeof runSummarySchema>;

export function redactFuzzyHit(hit: FuzzyCacheHit, marker: ValueMarker): FuzzyCacheHit {
  return markFields(hit, ["previousSource"], marker);
}

function redactLocaleSummary(locale: LocaleSummary, marker: ValueMarker): LocaleSummary {
  return {
    ...locale,
    fuzzyHits: locale.fuzzyHits.map((hit) => redactFuzzyHit(hit, marker)),
    protected: locale.protected.map((entry) => markFields(entry, ["suggestion"], marker)),
    notices: locale.notices.map((notice) => markFields(notice, ["message"], marker)),
    ...(locale.error !== undefined ? { error: markFields(locale.error, ["message"], marker) } : {}),
    ...(locale.integrityRefusals !== undefined
      ? {
          integrityRefusals: locale.integrityRefusals.map(
            ({ details: _details, ...refusal }) => refusal,
          ),
        }
      : {}),
  };
}

export function redactRunSummary(summary: RunSummary, marker: ValueMarker): RunSummary {
  return {
    ...summary,
    locales: summary.locales.map((locale) => redactLocaleSummary(locale, marker)),
  };
}

const localeEstimateSchema = z.object({
  locale: z.string(),
  keys: z.number(),
  requests: z.number(),
  inputTokens: z.number().optional(),
  outputTokens: z.number().optional(),
  sourceCharacters: z.number().optional(),
  cost: z.number().optional(),
});

export const runEstimateSchema = z.object({
  provider: z.string(),
  model: z.string().optional(),
  rateKey: z.string(),
  keys: z.number(),
  requests: z.number(),
  caveats: z.array(z.string()).readonly(),
  unit: z.enum(["tokens", "characters"]),
  inputTokens: z.number().optional(),
  outputTokens: z.number().optional(),
  sourceCharacters: z.number().optional(),
  pricing: z.enum(["priced", "no-rate-on-file", "rate-unit-mismatch", "not-billed"]),
  currency: z.string().optional(),
  asOf: z.string().optional(),
  cost: z.number().optional(),
  locales: z.array(localeEstimateSchema).readonly(),
});
