import { type DiffSummary, diff } from "@verbatra/sdk";
import { z } from "zod";
import type { McpToolContext } from "../types.js";
import { defineTool } from "./define-tool.js";

const paramsSchema = z.strictObject({
  locales: z.array(z.string().min(1)).min(1).optional(),
});

async function statusDiff(
  params: z.infer<typeof paramsSchema>,
  context: McpToolContext,
): Promise<DiffSummary> {
  return diff(
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

export const statusDiffTool = defineTool({
  name: "status.diff",
  description:
    "List, per target locale, the exact keys that would be added, re-translated, or orphaned by " +
    "the next translate run, without writing anything or calling a provider. Use this to preview " +
    "what a translate or translation.translatePending call would change before spending on it. " +
    "Pass locales to narrow the diff to a subset of configured target locales; omit it to diff " +
    "every configured target locale.",
  paramsSchema,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  handler: statusDiff,
});
