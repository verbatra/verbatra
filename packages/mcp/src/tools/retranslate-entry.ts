import { retranslateEntry } from "@verbatra/sdk";
import { z } from "zod";
import type { McpToolContext } from "../types.js";
import { defineTool } from "./define-tool.js";

const paramsSchema = z.strictObject({
  locale: z.string().min(1),
  key: z.string().min(1),
});

const integrityGateReasonSchema = z.enum(["placeholder", "icu", "degenerate", "empty"]);

const reviewReasonCodeSchema = z.enum([
  "LENGTH_RATIO_OUTLIER",
  "EQUALS_SOURCE",
  "GLOSSARY_TERM_MISSED",
  "INTEGRITY_REORDERED",
  "PROVIDER_DEGRADED",
]);

const retranslateEntryResultSchema = z.object({
  accepted: z.boolean(),
  value: z.string(),
  reviewReasons: z.array(reviewReasonCodeSchema).readonly().optional(),
  reason: integrityGateReasonSchema.optional(),
});

type RetranslateEntryResult = z.infer<typeof retranslateEntryResultSchema>;

async function retranslateKeyEntry(
  params: z.infer<typeof paramsSchema>,
  context: McpToolContext,
): Promise<RetranslateEntryResult> {
  return retranslateEntry(
    { config: context.config.config, cwd: context.cwd, locale: params.locale, key: params.key },
    {
      ...(context.fs !== undefined ? { fs: context.fs } : {}),
      ...(context.adapterRegistry !== undefined
        ? { adapterRegistry: context.adapterRegistry }
        : {}),
      ...(context.createProvider !== undefined ? { createProvider: context.createProvider } : {}),
    },
  );
}

export const retranslateEntryTool = defineTool({
  name: "translation.retranslateEntry",
  description:
    "Ask the configured translation provider for a fresh translation of one key in one target " +
    "locale, replacing the current value if the result passes the integrity gate. A rejected " +
    "result is returned as accepted: false with a reason, not an error. An accepted result may " +
    "still carry reviewReasons flagging it for human review (for example a length outlier or a " +
    "missed glossary term) even though it was written. Calls a translation provider and spends " +
    "against your API usage; only available when the server was started with spending allowed.",
  paramsSchema,
  outputSchema: retranslateEntryResultSchema,
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
  handler: retranslateKeyEntry,
});
