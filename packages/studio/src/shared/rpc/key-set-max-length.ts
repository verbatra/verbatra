import type { SetKeyLengthLimitResult } from "@verbatra/sdk";
import { z } from "zod";

export const KEY_SET_MAX_LENGTH_METHOD = "key.setMaxLength";

export const KEY_MAX_LENGTH = 1024;

export const keySetMaxLengthParamsSchema = z.strictObject({
  key: z.string().min(1).max(KEY_MAX_LENGTH),
  maxLength: z.number().int().positive().nullable(),
});

export type KeySetMaxLengthParams = z.infer<typeof keySetMaxLengthParamsSchema>;

export type KeySetMaxLengthResult = SetKeyLengthLimitResult;
