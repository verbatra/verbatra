import { type ReviewQueueResult, reviewQueue } from "@verbatra/sdk";
import { z } from "zod";
import type { McpToolContext } from "../types.js";
import { defineTool } from "./define-tool.js";

const paramsSchema = z.strictObject({});

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
    "Read the keys the last translate or translation.translatePending run flagged for human " +
    "review, along with the reasons for each, leaving out every key dealt with since: one whose " +
    "current value was approved or rejected in verbatra.provenance.json, one a person rewrote or " +
    "imported, and one with no translation any more. Each remaining entry carries the provenance " +
    "of its current value when verbatra.provenance.json is readable. Reports available: false when " +
    "no non-dry-run has completed in this project yet, which is a normal state, not an error. " +
    "Read-only, calls no provider; reads a snapshot left behind by the last run rather than " +
    "re-running anything.",
  paramsSchema,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  handler: readReviewQueue,
});
