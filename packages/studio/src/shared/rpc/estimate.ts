import type { RunSummary } from "@verbatra/sdk";
import { z } from "zod";

export const ESTIMATE_METHOD = "translation.estimate";

export const estimateParamsSchema = z.strictObject({
  locales: z.array(z.string().min(1)).min(1).optional(),
});

export type EstimateParams = z.infer<typeof estimateParamsSchema>;

export type EstimateResult = RunSummary;
