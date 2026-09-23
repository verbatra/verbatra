import { REVIEW_REASON_CODES } from "@verbatra/sdk";
import { z } from "zod";
import { keyProvenanceSchema } from "./provenance-schema.js";

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

export const localeRunStatusSchema = z.enum(["succeeded", "partial", "failed"]);

export const needsReviewEntrySchema = z.object({
  key: z.string(),
  reasons: z.array(reviewReasonCodeSchema).readonly(),
});

export const reviewQueueEntrySchema = needsReviewEntrySchema.extend({
  provenance: keyProvenanceSchema.optional(),
});

export const fuzzyCacheHitSchema = z.object({
  key: z.string(),
  previousSource: z.string(),
  similarity: z.number(),
});
