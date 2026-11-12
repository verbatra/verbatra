import type { IncompleteRun, RunBudget, UsageSummary } from "@verbatra/sdk";
import { z } from "zod";

export type { IncompleteRun };

export const USAGE_SUMMARY_METHOD = "usage.summary";

export const usageSummaryParamsSchema = z.strictObject({});

export type UsageSummaryParams = z.infer<typeof usageSummaryParamsSchema>;

export type UsageSummaryResult =
  | { readonly available: false }
  | {
      readonly available: true;
      readonly generatedAt: string;
      readonly usage?: UsageSummary;
      readonly budget?: RunBudget;
      readonly incomplete?: IncompleteRun;
    };
