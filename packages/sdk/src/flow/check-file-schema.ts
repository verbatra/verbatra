import type { AdapterErrorCode } from "@verbatra/format-adapters";
import { z } from "zod";
import type { CheckFileRole } from "./check-file.js";
import { checkQaSummarySchema, incompletePluralSchema, qaFindingSchema } from "./check-schema.js";

const ADAPTER_ERROR_CODES = [
  "INVALID_JSON",
  "INVALID_YAML",
  "INVALID_XML",
  "INVALID_STRUCTURE",
  "MAX_DEPTH_EXCEEDED",
  "INPUT_TOO_LARGE",
  "MIXED_STRUCTURE",
  "ADAPTER_FAILED",
  "DUPLICATE_FORMAT",
  "INVALID_FORMAT_ID",
] as const satisfies readonly AdapterErrorCode[];

const CHECK_FILE_ROLES = [
  "source",
  "target",
  "catalogue",
] as const satisfies readonly CheckFileRole[];

const syntaxFindingSchema = z.object({
  severity: z.literal("error"),
  reason: z.literal("syntax"),
  code: z.enum(ADAPTER_ERROR_CODES),
  message: z.string(),
  line: z.number().exactOptional(),
  column: z.number().exactOptional(),
});

/**
 * The zod schema for a {@link CheckFileSummary}, the `result` of `verbatra check --file --json`.
 * It allows fields it does not list.
 */
export const checkFileSummarySchema = z.object({
  file: z.string(),
  role: z.enum(CHECK_FILE_ROLES),
  locales: z
    .array(
      z.object({
        locale: z.string(),
        incompletePlurals: z.array(incompletePluralSchema).readonly(),
        qa: z.object({
          checked: z.number(),
          errors: z.number(),
          warnings: z.number(),
          findings: z.array(z.union([qaFindingSchema, syntaxFindingSchema])).readonly(),
        }),
      }),
    )
    .readonly(),
  qa: checkQaSummarySchema,
});
