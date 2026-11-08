import type { SetKeyLengthLimitResult } from "@verbatra/sdk";
import { z } from "zod";

export const KEY_SET_MAX_LENGTH_METHOD = "key.setMaxLength";

export const keySetMaxLengthParamsSchema = z.strictObject({
  key: z.string().min(1),
  maxLength: z.number().int().nullable(),
});

export type KeySetMaxLengthParams = z.infer<typeof keySetMaxLengthParamsSchema>;

export type KeySetMaxLengthResult = SetKeyLengthLimitResult;
