import type { ReviewDecisionResult as SdkReviewDecisionResult } from "@verbatra/sdk";
import { z } from "zod";

export const REVIEW_APPROVE_METHOD = "review.approve";

export const REVIEW_REJECT_METHOD = "review.reject";

export const MAX_REVIEWER_LENGTH = 64;

export const reviewDecisionParamsSchema = z.strictObject({
  locale: z.string().min(1),
  key: z.string().min(1),
  expectedValue: z.string(),
  reviewer: z.string().min(1).max(MAX_REVIEWER_LENGTH).optional(),
});

export const agentReviewDecisionParamsSchema = reviewDecisionParamsSchema.extend({
  reviewer: z.string().min(1).max(MAX_REVIEWER_LENGTH),
});

export type ReviewDecisionParams = z.infer<typeof reviewDecisionParamsSchema>;

export type ReviewDecisionResult = SdkReviewDecisionResult;
