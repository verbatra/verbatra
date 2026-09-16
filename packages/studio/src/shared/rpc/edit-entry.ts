import type { IntegrityGateReason } from "@verbatra/sdk";
import { z } from "zod";

export const EDIT_ENTRY_METHOD = "translation.editEntry";

export const editEntryParamsSchema = z.strictObject({
  locale: z.string().min(1),
  key: z.string().min(1),
  value: z.string().max(20_000),
});

export type EditEntryParams = z.infer<typeof editEntryParamsSchema>;

export type EditEntryResult =
  | {
      readonly accepted: true;
      readonly value: string;
    }
  | {
      readonly accepted: false;
      readonly reason: IntegrityGateReason;
      readonly details?: readonly string[];
      readonly value: string;
    };
