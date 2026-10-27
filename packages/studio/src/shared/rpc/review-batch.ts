import type { ReviewEntriesResult } from "@verbatra/sdk";
import { z } from "zod";

export const REVIEW_APPROVE_MANY_METHOD = "review.approveMany";

export const REVIEW_REJECT_MANY_METHOD = "review.rejectMany";

export const MAX_REVIEW_BATCH_ENTRIES = 100;

export const reviewBatchParamsSchema = z.strictObject({
  entries: z
    .array(
      z.strictObject({
        locale: z.string().min(1),
        key: z.string().min(1),
        expectedValue: z.string(),
      }),
    )
    .min(1)
    .max(MAX_REVIEW_BATCH_ENTRIES),
});

export type ReviewBatchParams = z.infer<typeof reviewBatchParamsSchema>;

export type ReviewBatchResult = ReviewEntriesResult;
