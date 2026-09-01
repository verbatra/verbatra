import { type CheckSummary, check } from "@verbatra/sdk";
import { z } from "zod";
import type { McpToolContext } from "../types.js";
import { defineTool } from "./define-tool.js";

const paramsSchema = z.strictObject({
  locales: z.array(z.string().min(1)).min(1).optional(),
});

async function statusCheck(
  params: z.infer<typeof paramsSchema>,
  context: McpToolContext,
): Promise<CheckSummary> {
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
    "Report, per target locale, how many keys are missing, stale, or up to date, and whether the " +
    "locale is fully in sync with the source. Use this to check translation status without " +
    "writing anything or calling a provider. Pass locales to narrow the report to a subset of " +
    "configured target locales; omit it to check every configured target locale.",
  paramsSchema,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  handler: statusCheck,
});
