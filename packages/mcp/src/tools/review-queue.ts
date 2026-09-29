import { reviewQueue } from "@verbatra/sdk";
import { z } from "zod";
import type { McpToolContext } from "../types.js";
import { defineTool } from "./define-tool.js";
import { fuzzyCacheHitSchema, reviewQueueEntrySchema } from "./run-schema.js";

const paramsSchema = z.strictObject({});

const reviewQueueLocaleSchema = z.object({
  locale: z.string(),
  needsReview: z.array(reviewQueueEntrySchema).readonly(),
  fuzzyHits: z.array(fuzzyCacheHitSchema).readonly().optional(),
});

const reviewQueueResultSchema = z.object({
  available: z.boolean(),
  reason: z.literal("provenance-unreadable").optional(),
  locales: z.array(reviewQueueLocaleSchema).readonly().optional(),
  lastRunAt: z.string().optional(),
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
    "Lists, per target locale, every key whose current value a provider, the translation " +
    "memory, a fuzzy match, or an AI agent wrote and that no person has approved yet, with the " +
    "provenance of that value. The queue is computed from the committed locale files, " +
    "verbatra.lock.json, and verbatra.provenance.json, so every teammate sees the same one. Use " +
    "it to find the translations waiting for a person, and to report them to the user. Each " +
    "entry's reasons are the flags the last translate run on this machine gave the key, empty " +
    "when it gave none; lastRunAt says when that run finished. A key leaves the queue once its " +
    "value is approved or rejected (review.approve, review.reject, or the Studio dashboard), or " +
    "a person rewrites or imports it; a key corrected through translation.editEntry stays " +
    "listed, because an agent's edit still needs a person's review. available: false with " +
    "reason provenance-unreadable means verbatra.provenance.json is corrupt or from a newer " +
    "verbatra, not an empty queue. Takes no parameters. Read-only: it calls no provider and " +
    "writes nothing.",
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
