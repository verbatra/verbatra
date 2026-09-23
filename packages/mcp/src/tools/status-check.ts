import { check } from "@verbatra/sdk";
import { z } from "zod";
import type { McpToolContext } from "../types.js";
import { defineTool } from "./define-tool.js";
import { provenanceSummarySchema } from "./provenance-schema.js";

const paramsSchema = z.strictObject({
  locales: z.array(z.string().min(1)).min(1).optional(),
});

const localeCheckSchema = z.object({
  locale: z.string(),
  missing: z.number(),
  stale: z.number(),
  upToDate: z.number(),
  inSync: z.boolean(),
  provenance: provenanceSummarySchema.optional(),
  protected: z.number().optional(),
});

const statusCheckResultSchema = z.object({
  inSync: z.boolean(),
  locales: z.array(localeCheckSchema).readonly(),
});

type StatusCheckResult = z.infer<typeof statusCheckResultSchema>;

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
    "Read-only: it calls no provider and writes nothing.",
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
