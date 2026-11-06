import type { IcuPreviewResult } from "@verbatra/sdk";
import { z } from "zod";

export const KEY_PREVIEW_ICU_METHOD = "key.previewIcu";

export const ICU_PREVIEW_VALUE_MAX_LENGTH = 20_000;
export const ICU_PREVIEW_ARGS_MAX_ENTRIES = 256;
export const ICU_PREVIEW_ARG_NAME_MAX_LENGTH = 128;
export const ICU_PREVIEW_ARG_TEXT_MAX_LENGTH = 256;

const sampleSchema = z.union([
  z.string().max(ICU_PREVIEW_ARG_TEXT_MAX_LENGTH),
  z.number().finite(),
]);

export const keyPreviewIcuParamsSchema = z.strictObject({
  locale: z.string().min(1).max(ICU_PREVIEW_ARG_NAME_MAX_LENGTH),
  value: z.string().max(ICU_PREVIEW_VALUE_MAX_LENGTH),
  args: z
    .record(z.string().min(1).max(ICU_PREVIEW_ARG_NAME_MAX_LENGTH), sampleSchema)
    .refine((args) => Object.keys(args).length <= ICU_PREVIEW_ARGS_MAX_ENTRIES)
    .optional(),
});

export type KeyPreviewIcuParams = z.infer<typeof keyPreviewIcuParamsSchema>;

export type KeyPreviewIcuResult = IcuPreviewResult;
