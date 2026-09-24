import type { RetranslateEntriesResult as SdkRetranslateEntriesResult } from "@verbatra/sdk";
import { z } from "zod";

export const RETRANSLATE_ENTRIES_METHOD = "translation.retranslateEntries";

export const MAX_RETRANSLATE_BATCH_ENTRIES = 20;

export const retranslateEntriesParamsSchema = z.strictObject({
  entries: z
    .array(z.strictObject({ locale: z.string().min(1), key: z.string().min(1) }))
    .min(1)
    .max(MAX_RETRANSLATE_BATCH_ENTRIES),
});

export type RetranslateEntriesParams = z.infer<typeof retranslateEntriesParamsSchema>;

export type RetranslateEntriesResult = SdkRetranslateEntriesResult;
