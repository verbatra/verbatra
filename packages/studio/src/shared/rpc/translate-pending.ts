import type { RunSummary } from "@verbatra/sdk";
import { z } from "zod";

export const TRANSLATE_PENDING_METHOD = "translation.translatePending";

export const translatePendingParamsSchema = z.strictObject({
  locales: z.array(z.string().min(1)).min(1).optional(),
  maxTokens: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional(),
});

export type TranslatePendingParams = z.infer<typeof translatePendingParamsSchema>;

export type TranslatePendingResult = RunSummary;
