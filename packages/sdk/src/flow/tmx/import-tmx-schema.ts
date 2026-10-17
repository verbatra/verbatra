import { z } from "zod";
import { INTEGRITY_GATE_REASONS } from "../integrity-gate.js";
import { integrityGateReasonSchema } from "../summary-schema.js";

const languageReportSchema = z.object({ language: z.string(), units: z.number() });
const optionalString = z.union([z.string(), z.undefined()]);

/**
 * The zod schema for an {@link ImportTmxResult}, the `result` of `verbatra tmx import --json`.
 * A zod 4 schema: `parse` accepts fields it does not list and strips them from its result.
 */
export const importTmxResultSchema = z.object({
  dryRun: z.boolean(),
  file: z.string(),
  sourceLanguage: optionalString,
  units: z.number(),
  locales: z
    .array(
      z.object({
        locale: z.string(),
        added: z.number(),
        unchanged: z.number(),
        overwritten: z.number(),
        kept: z.number(),
        duplicates: z.number(),
        conflicting: z.number(),
        rejected: z.record(z.enum([...INTEGRITY_GATE_REASONS, "sourceBlank"]), z.number()),
        refusals: z
          .array(
            z.object({
              unit: z.number(),
              reason: integrityGateReasonSchema,
              details: z.array(z.string()).readonly().exactOptional(),
            }),
          )
          .readonly(),
      }),
    )
    .readonly(),
  skippedUnits: z.number(),
  unreachableUnits: z.number(),
  sourceLanguageMismatch: optionalString,
  unmatchedSourceUnits: z.number(),
  conflictingSourceUnits: z.number(),
  markupStrippedUnits: z.number(),
  subflowDroppedUnits: z.number(),
  unmatchedLanguages: z.array(languageReportSchema).readonly(),
  ambiguousLanguages: z.array(languageReportSchema).readonly(),
  notImported: z.array(languageReportSchema).readonly(),
  memoryWritable: z.boolean(),
});
