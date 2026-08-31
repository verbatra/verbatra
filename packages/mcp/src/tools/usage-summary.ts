import { runStatus } from "@verbatra/sdk";
import { z } from "zod";
import type { McpToolContext } from "../types.js";
import { defineTool } from "./define-tool.js";

const paramsSchema = z.strictObject({});

const usageSchema = z.strictObject({
  inputTokens: z.number(),
  outputTokens: z.number(),
});

const budgetSchema = z.strictObject({
  maxTokens: z.number(),
  behavior: z.enum(["warn", "stop"]),
  supported: z.boolean(),
  tokensUsed: z.number(),
  exceeded: z.boolean(),
});

const usageSummaryResultSchema = z.object({
  available: z.boolean(),
  generatedAt: z.string().optional(),
  usage: usageSchema.optional(),
  budget: budgetSchema.optional(),
});

type UsageSummaryResult = z.infer<typeof usageSummaryResultSchema>;

async function usageSummary(
  _params: z.infer<typeof paramsSchema>,
  context: McpToolContext,
): Promise<UsageSummaryResult> {
  const result = await runStatus({ cwd: context.cwd });
  if (!result.available) {
    return { available: false };
  }
  return {
    available: true,
    generatedAt: result.generatedAt,
    ...(result.usage !== undefined ? { usage: result.usage } : {}),
    ...(result.budget !== undefined ? { budget: result.budget } : {}),
  };
}

export const usageSummaryTool = defineTool({
  name: "usage.summary",
  description:
    "Read the token usage and budget status left behind by the last translate or " +
    "translation.translatePending run: input and output tokens consumed, and, when a token " +
    "budget is configured, its ceiling, behavior, and whether it was exceeded. Reports " +
    "available: false when no non-dry-run has completed in this project yet. Read-only, calls no " +
    "provider.",
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
