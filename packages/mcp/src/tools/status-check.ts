import { check, type PluralCategory, type PluralRuleType } from "@verbatra/sdk";
import { z } from "zod";
import type { McpToolContext } from "../types.js";
import { defineTool } from "./define-tool.js";
import { provenanceSummarySchema } from "./provenance-schema.js";

const paramsSchema = z.strictObject({
  locales: z.array(z.string().min(1)).min(1).optional(),
});

const PLURAL_CATEGORY_NAMES = [
  "zero",
  "one",
  "two",
  "few",
  "many",
  "other",
] as const satisfies readonly PluralCategory[];

const PLURAL_RULE_TYPES = ["cardinal", "ordinal"] as const satisfies readonly PluralRuleType[];

const incompletePluralSchema = z.object({
  code: z.literal("PLURAL_CATEGORIES_INCOMPLETE"),
  key: z.string(),
  argument: z.string().optional(),
  ruleType: z.enum(PLURAL_RULE_TYPES),
  missing: z.array(z.enum(PLURAL_CATEGORY_NAMES)).readonly(),
});

const localeCheckSchema = z.object({
  locale: z.string(),
  missing: z.number(),
  stale: z.number(),
  upToDate: z.number(),
  inSync: z.boolean(),
  provenance: provenanceSummarySchema.optional(),
  protected: z.number().optional(),
  incompletePlurals: z.array(incompletePluralSchema).readonly().optional(),
});

const statusCheckResultSchema = z.object({
  inSync: z.boolean(),
  locales: z.array(localeCheckSchema).readonly(),
});

export type StatusCheckResult = z.infer<typeof statusCheckResultSchema>;

async function statusCheck(
  params: z.infer<typeof paramsSchema>,
  context: McpToolContext,
): Promise<StatusCheckResult> {
  return check(
    {
      config: context.config.config,
      cwd: context.cwd,
      ...(params.locales !== undefined ? { locales: params.locales } : {}),
    },
    {
      ...(context.fs !== undefined ? { fs: context.fs } : {}),
      ...(context.adapterRegistry !== undefined
        ? { adapterRegistry: context.adapterRegistry }
        : {}),
    },
  );
}

export const statusCheckTool = defineTool({
  name: "status.check",
  values: "none",
  description:
    "Reports, per target locale, how many keys are missing, stale, or up to date against " +
    "the source, and whether the locale is in sync, as counts only. Use it for a fast " +
    "answer to how far a project has drifted before deciding whether any translation work " +
    "is needed. Do not use it when you need the affected key names, which only status.diff " +
    "returns. The optional locales parameter narrows the report to the named target " +
    "locales; omit it to cover every configured target locale. Each locale also carries " +
    "provenance, the counts of who wrote its current values (byOrigin, byReviewState) over " +
    "the keys present in both the source and that locale, read from " +
    "verbatra.provenance.json and absent when that file is corrupt or from a newer " +
    "verbatra. protected counts the missing and stale keys a translate run would leave for " +
    "a person (values a person wrote or imported, or pinned keys); they stay stale until a " +
    "person resolves them, and only pinned keys are counted when that file is unreadable. " +
    "incompletePlurals lists each plural whose forms in that locale lack CLDR plural categories " +
    "the target language uses, with the missing categories; it is a warning and never changes " +
    "the counts or inSync. Read-only: it calls no provider and writes nothing.",
  paramsSchema,
  outputSchema: statusCheckResultSchema,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  handler: statusCheck,
});
