import type { ReviewQueueResult as SdkReviewQueueResult } from "@verbatra/sdk";
import { z } from "zod";

export const REVIEW_QUEUE_METHOD = "review.queue";

export const reviewQueueParamsSchema = z.strictObject({
  includeApproved: z.boolean().optional(),
});

export type ReviewQueueParams = z.infer<typeof reviewQueueParamsSchema>;

export type ReviewQueueResult = SdkReviewQueueResult;
