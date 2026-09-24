import type { IntegrityGateReason } from "@verbatra/sdk";
import { z } from "zod";

export const EDIT_ENTRY_METHOD = "translation.editEntry";

export const MAX_EDIT_VALUE_LENGTH = 20_000;

export const editEntryParamsSchema = z.strictObject({
  locale: z.string().min(1),
  key: z.string().min(1),
  value: z.string().max(MAX_EDIT_VALUE_LENGTH),
  actor: z.enum(["human", "agent"]).optional(),
});

export const agentEditEntryParamsSchema = editEntryParamsSchema.omit({ actor: true });

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
