import type { KeyContext } from "@verbatra/sdk";
import { z } from "zod";
import { MAX_EDIT_VALUE_LENGTH } from "./edit-entry.js";

export const KEY_CONTEXT_METHOD = "key.context";

export const keyContextParamsSchema = z.strictObject({
  locale: z.string().min(1),
  key: z.string().min(1),
  draft: z.string().max(MAX_EDIT_VALUE_LENGTH).optional(),
});

export type KeyContextParams = z.infer<typeof keyContextParamsSchema>;

export type KeyContextResult = KeyContext;
