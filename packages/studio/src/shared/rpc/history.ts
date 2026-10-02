import type { LocaleHistoryCommit, LocaleHistoryResult } from "@verbatra/sdk";
import { z } from "zod";

export const HISTORY_LIST_METHOD = "history.list";

export const historyListParamsSchema = z.strictObject({
  limit: z.number().int().positive().optional(),
});

export type HistoryListParams = z.infer<typeof historyListParamsSchema>;

export type HistoryCommit = LocaleHistoryCommit;

export type HistoryListResult = LocaleHistoryResult;
