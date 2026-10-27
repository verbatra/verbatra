import { budgetStanding, runStatus, runSummarySchema } from "@verbatra/sdk";
import { z } from "zod";
import type { McpToolContext } from "../types.js";
import { defineTool } from "./define-tool.js";

const paramsSchema = z.strictObject({});

const budgetSchema = runSummarySchema.shape.budget.unwrap().extend({
  standing: z.enum(["within", "stopped-before-ceiling", "reached"]),
});

const usageSummaryResultSchema = z.object({
  available: z.boolean(),
  generatedAt: z.string().optional(),
  usage: runSummarySchema.shape.usage.unwrap().optional(),
  budget: budgetSchema.optional(),
});

type UsageSummaryResult = z.infer<typeof usageSummaryResultSchema>;

async function usageSummary(
  _params: z.infer<typeof paramsSchema>,
  context: McpToolContext,
): Promise<UsageSummaryResult> {
  const result = await runStatus(
    { cwd: context.cwd },
    { ...(context.fs !== undefined ? { fs: context.fs } : {}) },
  );
  if (!result.available) {
    return { available: false };
  }
  return {
    available: true,
    generatedAt: result.generatedAt,
    ...(result.usage !== undefined ? { usage: result.usage } : {}),
    ...(result.budget !== undefined
      ? { budget: { ...result.budget, standing: budgetStanding(result.budget) } }
      : {}),
  };
}

export const usageSummaryTool = defineTool({
  name: "usage.summary",
  values: "none",
  description:
    "Reads the token usage and budget status left behind by the last translate or " +
    "translation.translatePending run: input and output tokens consumed and, when a token " +
    "budget is configured, its ceiling, behavior, how much of it was counted, and whether " +
    "it was exceeded. Use it to report what the last run cost before deciding, with the " +
    "user, to spend more. Do not expect live figures: only a real translate run updates it, " +
    "and available: false means no non-dry run has completed in this project yet. " +
    "budget.standing says where the run ended against its ceiling: within when it never " +
    "reached it; stopped-before-ceiling when a stop budget withheld a request that would " +
    "have crossed it while the counted total was still below it; reached when the counted " +
    "total reached or passed it. budget.supported says where budget.tokensUsed came from: " +
    "true when every request reported its own usage, false when at least one did not and " +
    "the figure is partly verbatra's own estimate, which is the case for every " +
    "machine-translation provider, since none reports token usage, and for any request " +
    "that failed. It is true with tokensUsed 0 when " +
    "the run sent no request at all, since nothing was estimated. The budget is enforced " +
    "either way, and it covers one translate run: it does not cap a single-entry " +
    "retranslation. Takes no parameters. Read-only: it calls no provider and writes " +
    "nothing.",
  paramsSchema,
  outputSchema: usageSummaryResultSchema,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  handler: usageSummary,
});
