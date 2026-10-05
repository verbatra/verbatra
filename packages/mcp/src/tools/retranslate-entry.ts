import { retranslateEntry } from "@verbatra/sdk";
import { z } from "zod";
import type { McpToolCallContext } from "../types.js";
import { defineTool } from "./define-tool.js";
import { integrityGateReasonSchema } from "./integrity-gate-reason.js";
import {
  LOCK_TIMEOUT_DESCRIPTION,
  lockAcquireTimeoutMs,
  lockTimeoutMsSchema,
} from "./lock-timeout.js";
import { reviewReasonCodeSchema } from "./run-schema.js";
import { redactWriteResult } from "./value-redaction.js";

const paramsSchema = z.strictObject({
  locale: z.string().min(1),
  key: z.string().min(1),
  lockTimeoutMs: lockTimeoutMsSchema,
});

const retranslateEntryResultSchema = z.object({
  accepted: z.boolean(),
  value: z.string(),
  reviewReasons: z.array(reviewReasonCodeSchema).readonly().optional(),
  reason: integrityGateReasonSchema.optional(),
  details: z.array(z.string()).readonly().optional(),
});

export type RetranslateEntryResult = z.infer<typeof retranslateEntryResultSchema>;

async function retranslateKeyEntry(
  params: z.infer<typeof paramsSchema>,
  context: McpToolCallContext,
): Promise<RetranslateEntryResult> {
  return retranslateEntry(
    {
      config: context.config.config,
      cwd: context.cwd,
      locale: params.locale,
      key: params.key,
      lockAcquireTimeoutMs: lockAcquireTimeoutMs(params.lockTimeoutMs),
      ...(context.signal !== undefined ? { signal: context.signal } : {}),
    },
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
  values: { redact: redactWriteResult },
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
    "missed glossary term) even though it was written. A key matching the config's " +
    "pinnedKeys is always refused with KEY_PINNED. A key whose value a person wrote, " +
    "imported, or changed outside verbatra is refused with KEY_PROTECTED unless " +
    "project.snapshot reports humanEdits: overwrite, in which case it is replaced like any " +
    "other key. Leave refused keys for a person. " +
    LOCK_TIMEOUT_DESCRIPTION +
    "The wait comes before the provider is called, so a timed-out call spends nothing. Cost: calls a translation provider and " +
    "bills your API usage on every call, and it is outside the per-run token budget. Only " +
    "listed when the server was started with spending allowed and a translation provider is " +
    "configured; ask the user before calling it.",
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
