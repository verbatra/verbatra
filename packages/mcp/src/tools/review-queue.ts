import { type RunStatusResult, runStatus } from "@verbatra/sdk";
import { z } from "zod";
import type { McpToolContext } from "../types.js";
import { defineTool } from "./define-tool.js";

const paramsSchema = z.strictObject({});

async function reviewQueue(
  _params: z.infer<typeof paramsSchema>,
  context: McpToolContext,
): Promise<RunStatusResult> {
  return runStatus(
    { cwd: context.cwd },
    { ...(context.fs !== undefined ? { fs: context.fs } : {}) },
  );
}

export const reviewQueueTool = defineTool({
  name: "review.queue",
  description:
    "Read the keys the last translate or translation.translatePending run flagged for human " +
    "review, along with the reasons for each. Reports available: false when no non-dry-run has " +
    "completed in this project yet, which is a normal state, not an error. Read-only, calls no " +
    "provider; reads a snapshot left behind by the last run rather than re-running anything.",
  paramsSchema,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  handler: reviewQueue,
});
