import type { IntegrityGateReason, ReviewReasonCode } from "@verbatra/sdk";
import { z } from "zod";

export const RETRANSLATE_ENTRY_METHOD = "translation.retranslateEntry";

export const retranslateEntryParamsSchema = z.strictObject({
  locale: z.string().min(1),
  key: z.string().min(1),
});

export type RetranslateEntryParams = z.infer<typeof retranslateEntryParamsSchema>;

export type RetranslateEntryResult =
  | {
      readonly accepted: true;
      readonly value: string;
      readonly reviewReasons: readonly ReviewReasonCode[];
    }
  | {
      readonly accepted: false;
      readonly reason: IntegrityGateReason;
      readonly details?: readonly string[];
      readonly value: string;
    };
