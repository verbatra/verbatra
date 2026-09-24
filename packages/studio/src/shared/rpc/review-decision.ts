import type { ReviewDecisionResult as SdkReviewDecisionResult } from "@verbatra/sdk";
import { z } from "zod";
import { RETRANSLATE_ENTRIES_METHOD } from "./retranslate-entries.js";
import { REVIEW_APPROVE_MANY_METHOD, REVIEW_REJECT_MANY_METHOD } from "./review-batch.js";

export const REVIEW_APPROVE_METHOD = "review.approve";

export const REVIEW_REJECT_METHOD = "review.reject";

export const HUMAN_ONLY_METHOD_NAMES = [
  REVIEW_APPROVE_METHOD,
  REVIEW_REJECT_METHOD,
  REVIEW_APPROVE_MANY_METHOD,
  REVIEW_REJECT_MANY_METHOD,
  RETRANSLATE_ENTRIES_METHOD,
] as const;

export type HumanOnlyMethodName = (typeof HUMAN_ONLY_METHOD_NAMES)[number];

export const reviewDecisionParamsSchema = z.strictObject({
  locale: z.string().min(1),
  key: z.string().min(1),
  expectedValue: z.string(),
});

export type ReviewDecisionParams = z.infer<typeof reviewDecisionParamsSchema>;

export type ReviewDecisionResult = SdkReviewDecisionResult;
