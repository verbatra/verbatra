import { type RunSummary, translate } from "@verbatra/sdk";
import { z } from "zod";
import type { McpToolContext } from "../types.js";
import { defineTool } from "./define-tool.js";

const paramsSchema = z.strictObject({});

async function translatePending(
  _params: z.infer<typeof paramsSchema>,
  context: McpToolContext,
): Promise<RunSummary> {
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
    "Translate every missing or stale key across every configured target locale in one run, " +
    "calling the configured translation provider and writing the resulting locale files. This " +
    "is the same operation the verbatra translate CLI command runs with no locale filter. Call " +
    "status.diff first to see what this would change before running it. Calls a translation " +
    "provider and spends against your API usage; only available when the server was started " +
    "with spending allowed.",
  paramsSchema,
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
  handler: translatePending,
});
