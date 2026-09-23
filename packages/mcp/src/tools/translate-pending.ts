import { assertMachineTranslationEnabled, translate } from "@verbatra/sdk";
import { z } from "zod";
import type { McpToolContext } from "../types.js";
import { defineTool } from "./define-tool.js";
import {
  fuzzyCacheHitSchema,
  localeRunStatusSchema,
  needsReviewEntrySchema,
  runBudgetSchema,
  usageSchema,
} from "./run-schema.js";

const paramsSchema = z.strictObject({});

const keyListSchema = z.array(z.string()).readonly();

const protectedKeySchema = z.object({
  key: z.string(),
  reason: z.enum(["human", "import", "external", "pinned"]),
  suggestion: z.string().optional(),
  suggestionStatus: z
    .enum(["planned", "suggested", "integrity-mismatch", "provider-failure", "budget-withheld"])
    .optional(),
});

const localeSummarySchema = z.object({
  locale: z.string(),
  status: localeRunStatusSchema,
  translated: keyListSchema,
  unchanged: keyListSchema,
  orphaned: keyListSchema,
  pruned: keyListSchema,
  invalidIcuSource: keyListSchema,
  cacheHits: keyListSchema,
  fuzzyHits: z.array(fuzzyCacheHitSchema).readonly(),
  integrityMismatches: keyListSchema,
  providerFailures: keyListSchema,
  generated: keyListSchema,
  budgetWithheld: keyListSchema,
  usage: usageSchema.optional(),
  notices: z.array(z.object({ code: z.string(), message: z.string() })).readonly(),
  needsReview: z.array(needsReviewEntrySchema).readonly(),
  unfilled: keyListSchema,
  protected: z.array(protectedKeySchema).readonly(),
  malformedRows: z
    .array(z.object({ row: z.number(), line: z.number().optional(), column: z.string() }))
    .readonly(),
  duplicateKeys: z
    .array(z.object({ key: z.string(), row: z.number(), line: z.number().optional() }))
    .readonly(),
  error: z.object({ code: z.string(), message: z.string() }).optional(),
});

const translatePendingResultSchema = z.object({
  dryRun: z.boolean(),
  locales: z.array(localeSummarySchema).readonly(),
  succeeded: keyListSchema,
  partial: keyListSchema,
  failed: keyListSchema,
  usage: usageSchema.optional(),
  budget: runBudgetSchema.optional(),
});

type TranslatePendingResult = z.infer<typeof translatePendingResultSchema>;

async function translatePending(
  _params: z.infer<typeof paramsSchema>,
  context: McpToolContext,
): Promise<TranslatePendingResult> {
  assertMachineTranslationEnabled(context.config.config, "translating every pending key");
  return translate(
    { config: context.config.config, cwd: context.cwd },
    {
      ...(context.fs !== undefined ? { fs: context.fs } : {}),
      ...(context.adapterRegistry !== undefined
        ? { adapterRegistry: context.adapterRegistry }
        : {}),
      ...(context.createProvider !== undefined ? { createProvider: context.createProvider } : {}),
    },
  );
}

export const translatePendingTool = defineTool({
  name: "translation.translatePending",
  description:
    "Translates every missing or stale key across every configured target locale in one " +
    "run, calling the configured translation provider and writing the resulting locale " +
    "files, lock file, and run status; the same operation as the verbatra translate CLI " +
    "command with no locale filter. Use it only after status.diff has shown the user what " +
    "would change and the user has explicitly agreed to spend. Do not retry it as though it " +
    "were free: it is not idempotent and bills again for whatever is still pending, and a " +
    "run that fails partway can leave some locales written and others untouched. It deletes " +
    "orphaned keys when project.snapshot reports prune: true; say so to the user before " +
    "running it. Pinned keys are always left alone. Stale keys a person wrote, imported, or " +
    "changed outside verbatra are left alone too, and listed under protected in each " +
    "locale, unless project.snapshot reports humanEdits: overwrite, in which case they are " +
    "retranslated like any other key; under humanEdits: suggest they are also sent to the " +
    "provider for a suggestion that is reported but never written. Check failed and partial " +
    "before treating the run as clean, then read review.queue for what needs a person. " +
    "Cost: calls a translation provider and bills your API usage, within the config's token " +
    "budget when one is set. Only listed when the server was started with spending allowed " +
    "and a translation provider is configured.",
  paramsSchema,
  outputSchema: translatePendingResultSchema,
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: true,
  },
  handler: translatePending,
});
