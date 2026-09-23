import { reviewQueue } from "@verbatra/sdk";
import { z } from "zod";
import type { McpToolContext } from "../types.js";
import { defineTool } from "./define-tool.js";
import {
  fuzzyCacheHitSchema,
  localeRunStatusSchema,
  reviewQueueEntrySchema,
  runBudgetSchema,
  usageSchema,
} from "./run-schema.js";

const paramsSchema = z.strictObject({});

const reviewQueueLocaleSchema = z.object({
  locale: z.string(),
  status: localeRunStatusSchema,
  needsReview: z.array(reviewQueueEntrySchema).readonly(),
  fuzzyHits: z.array(fuzzyCacheHitSchema).readonly().optional(),
  usage: usageSchema.optional(),
});

const reviewQueueResultSchema = z.object({
  available: z.boolean(),
  version: z.number().optional(),
  generatedAt: z.string().optional(),
  usage: usageSchema.optional(),
  budget: runBudgetSchema.optional(),
  locales: z.array(reviewQueueLocaleSchema).readonly().optional(),
});

type ReviewQueueResult = z.infer<typeof reviewQueueResultSchema>;

async function readReviewQueue(
  _params: z.infer<typeof paramsSchema>,
  context: McpToolContext,
): Promise<ReviewQueueResult> {
  return reviewQueue(
    { config: context.config.config, cwd: context.cwd },
    {
      ...(context.fs !== undefined ? { fs: context.fs } : {}),
      ...(context.adapterRegistry !== undefined
        ? { adapterRegistry: context.adapterRegistry }
        : {}),
    },
  );
}

export const reviewQueueTool = defineTool({
  name: "review.queue",
  description:
    "Lists, per locale, the keys the last translate or translation.translatePending run " +
    "flagged for a person, with the reason codes behind each flag. Use it after a run to " +
    "find the translations most worth a second look, and to report them to the user. Do not " +
    "treat available: false as an empty queue: it means no non-dry run has recorded a " +
    "status snapshot in this project yet, or that snapshot is unusable, which is a normal " +
    "state, not an error. A key leaves the queue once its current value is approved or " +
    "rejected in verbatra.provenance.json, a person rewrote or imported it, or it has no " +
    "translation any more; a key corrected through translation.editEntry stays listed, " +
    "because an agent's edit still needs a person's review. Each remaining entry carries " +
    "the provenance of its current value when verbatra.provenance.json is readable. Takes " +
    "no parameters. Read-only: it reads the snapshot the last run left behind, re-runs " +
    "nothing, calls no provider, and writes nothing.",
  paramsSchema,
  outputSchema: reviewQueueResultSchema,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  handler: readReviewQueue,
});
