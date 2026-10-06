import { PLURAL_CATEGORIES } from "@verbatra/core";
import { z } from "zod";
import { SENSITIVE_DETECTORS } from "../config/sensitive-config.js";
import { provenanceSummarySchema } from "../lock/key-provenance-schema.js";
import type { SensitiveField } from "../sensitive/guard.js";
import { integrityGateReasonSchema, reviewReasonCodeSchema } from "./summary-schema.js";

const SENSITIVE_FIELDS = [
  "key",
  "value",
  "description",
  "meaning",
] as const satisfies readonly SensitiveField[];

const keyListSchema = z.array(z.string()).readonly();
const detailsSchema = keyListSchema.exactOptional();

export const incompletePluralSchema = z.object({
  code: z.literal("PLURAL_CATEGORIES_INCOMPLETE"),
  key: z.string(),
  argument: z.string().exactOptional(),
  ruleType: z.enum(["cardinal", "ordinal"]),
  missing: z.array(z.enum(PLURAL_CATEGORIES)).readonly(),
});

export const qaFindingSchema = z.union([
  z.object({
    key: z.string(),
    severity: z.literal("error"),
    reason: integrityGateReasonSchema,
    details: detailsSchema,
  }),
  z.object({
    key: z.string(),
    severity: z.literal("warning"),
    reason: reviewReasonCodeSchema,
    details: detailsSchema,
  }),
]);

export const checkQaSummarySchema = z.object({
  errors: z.number(),
  warnings: z.number(),
  invalidSourceKeys: keyListSchema,
});

const inconsistencyGroupSchema = z.object({
  source: z.string(),
  context: z.string().exactOptional(),
  description: z.string().exactOptional(),
  meaning: z.string().exactOptional(),
  isPlural: z.boolean(),
  pluralForm: z.string().exactOptional(),
  translations: z.array(z.object({ value: z.string(), keys: keyListSchema })).readonly(),
});

const localeCheckSummarySchema = z.object({
  locale: z.string(),
  missing: z.number(),
  stale: z.number(),
  upToDate: z.number(),
  inSync: z.boolean(),
  emptySource: z.number().exactOptional(),
  provenance: provenanceSummarySchema.exactOptional(),
  protected: z.number().exactOptional(),
  incompletePlurals: z.array(incompletePluralSchema).readonly().exactOptional(),
  inconsistencies: z.array(inconsistencyGroupSchema).readonly().exactOptional(),
  qa: z
    .object({
      checked: z.number(),
      errors: z.number(),
      warnings: z.number(),
      findings: z.array(qaFindingSchema).readonly(),
    })
    .exactOptional(),
  review: z.object({ unreviewed: keyListSchema }).exactOptional(),
});

const sensitiveFindingSourceSchema = z.union([
  z.enum(SENSITIVE_DETECTORS),
  z.literal("pattern"),
  z.templateLiteral(["pattern-timeout-", z.number()]),
]);

/**
 * The zod schema for a {@link CheckSummary}, the `result` of `verbatra check --json` for a whole
 * project. It allows fields it does not list.
 */
export const checkSummarySchema = z.object({
  inSync: z.boolean(),
  locales: z.array(localeCheckSummarySchema).readonly(),
  qa: checkQaSummarySchema.exactOptional(),
  review: z
    .object({
      reviewed: z.boolean(),
      unreviewed: z.number(),
      code: z.enum(["REVIEW_REQUIRED", "REVIEW_STATE_UNREADABLE"]).exactOptional(),
    })
    .exactOptional(),
  sensitive: z
    .object({
      findings: z
        .array(
          z.object({
            key: z.string(),
            fields: z.array(z.enum(SENSITIVE_FIELDS)).readonly(),
            detectors: z.array(sensitiveFindingSourceSchema).readonly(),
          }),
        )
        .readonly(),
      glossaryTerms: z.number(),
    })
    .exactOptional(),
});
