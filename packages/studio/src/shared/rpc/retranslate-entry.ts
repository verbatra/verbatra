import type { IntegrityGateReason, ReviewReasonCode, UsageSummary } from "@verbatra/sdk";
import { z } from "zod";

export const RETRANSLATE_ENTRY_METHOD = "translation.retranslateEntry";

export const retranslateEntryParamsSchema = z.strictObject({
  locale: z.string().min(1),
  key: z.string().min(1),
  includeHuman: z.boolean().optional(),
});

export const agentRetranslateEntryParamsSchema = retranslateEntryParamsSchema.omit({
  includeHuman: true,
});

export type RetranslateEntryParams = z.infer<typeof retranslateEntryParamsSchema>;

export type RetranslateEntryResult =
  | {
      readonly accepted: true;
      readonly value: string;
      readonly reviewReasons: readonly ReviewReasonCode[];
      readonly usage?: UsageSummary;
    }
  | {
      readonly accepted: false;
      readonly reason: IntegrityGateReason;
      readonly details?: readonly string[];
      readonly value: string;
      readonly usage?: UsageSummary;
    };
