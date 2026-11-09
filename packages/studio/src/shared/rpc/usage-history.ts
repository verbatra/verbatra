import type { RunHistoryResult } from "@verbatra/sdk";
import { z } from "zod";

export const USAGE_HISTORY_METHOD = "usage.history";

export const usageHistoryParamsSchema = z.strictObject({
  limit: z.number().optional(),
});

export type UsageHistoryParams = z.infer<typeof usageHistoryParamsSchema>;

export type UsageHistoryResult = RunHistoryResult;
