import { retranslateEntry } from "@verbatra/sdk";
import { z } from "zod";
import type { McpToolContext } from "../types.js";
import { defineTool } from "./define-tool.js";
import { integrityGateReasonSchema } from "./integrity-gate-reason.js";
import { reviewReasonCodeSchema } from "./run-schema.js";

const paramsSchema = z.strictObject({
  locale: z.string().min(1),
  key: z.string().min(1),
});

const retranslateEntryResultSchema = z.object({
  accepted: z.boolean(),
  value: z.string(),
  reviewReasons: z.array(reviewReasonCodeSchema).readonly().optional(),
  reason: integrityGateReasonSchema.optional(),
  details: z.array(z.string()).readonly().optional(),
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
    "Asks the configured translation provider for a fresh translation of one key in one " +
    "target locale, and writes it over the current value when it passes the integrity gate. " +
    "Use it when the source text changed or the current translation is wrong and you do not " +
    "know the correct text yourself; if you do, translation.editEntry is free. Do not call " +
    "it in a loop to fix many keys: status.diff and translation.translatePending cover a " +
    "whole project in one run. The required locale parameter must be a configured target " +
    "locale and the required key parameter must exist in the source. A rejected result is " +
    "returned as accepted: false with a reason and writes nothing. An accepted result may " +
    "still carry reviewReasons flagging it for a person (for example a length outlier or a " +
    "missed glossary term) even though it was written. A key whose value a person wrote, " +
    "imported, or changed outside verbatra is refused with KEY_PROTECTED, and a key " +
    "matching the config's pinnedKeys with KEY_PINNED; leave those for a person. Cost: " +
    "calls a translation provider and bills your API usage on every call, and it is outside " +
    "the per-run token budget. Only listed when the server was started with spending " +
    "allowed and a translation provider is configured; ask the user before calling it.",
  paramsSchema,
  outputSchema: retranslateEntryResultSchema,
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: true,
  },
  handler: retranslateKeyEntry,
});
