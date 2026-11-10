import type { ApplyValueReplaceResult, ValueReplacePreview } from "@verbatra/sdk";
import { z } from "zod";

export const PREVIEW_VALUE_REPLACE_METHOD = "translation.previewValueReplace";

export const APPLY_VALUE_REPLACE_METHOD = "translation.applyValueReplace";

export const MAX_VALUE_REPLACE_ENTRIES = 1_000;

const criteriaShape = {
  find: z.string(),
  replace: z.string(),
  caseSensitive: z.boolean().optional(),
};

export const previewValueReplaceParamsSchema = z.strictObject({
  ...criteriaShape,
  locales: z.array(z.string().min(1)).min(1).optional(),
});

export const applyValueReplaceParamsSchema = z.strictObject({
  ...criteriaShape,
  entries: z
    .array(
      z.strictObject({
        locale: z.string().min(1),
        key: z.string().min(1),
        valueHash: z.string().min(1),
      }),
    )
    .min(1)
    .max(MAX_VALUE_REPLACE_ENTRIES),
  includePinned: z.boolean().optional(),
  includeProtected: z.boolean().optional(),
});

export type PreviewValueReplaceParams = z.infer<typeof previewValueReplaceParamsSchema>;

export type ApplyValueReplaceParams = z.infer<typeof applyValueReplaceParamsSchema>;

export type PreviewValueReplaceResult = ValueReplacePreview;

export type ApplyValueReplaceResultPayload = ApplyValueReplaceResult;
