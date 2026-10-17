import { editEntry, INTEGRITY_GATE_REASONS } from "@verbatra/sdk";
import { z } from "zod";
import type { McpToolContext } from "../types.js";
import { defineTool } from "./define-tool.js";
import {
  LOCK_TIMEOUT_DESCRIPTION,
  lockAcquireTimeoutMs,
  lockTimeoutMsSchema,
} from "./lock-timeout.js";
import { redactWriteResult } from "./value-redaction.js";

const paramsSchema = z.strictObject({
  locale: z.string().min(1),
  key: z.string().min(1),
  value: z.string().max(20_000),
  lockTimeoutMs: lockTimeoutMsSchema,
});

const editEntryResultSchema = z.object({
  accepted: z.boolean(),
  value: z.string(),
  reason: z.enum(INTEGRITY_GATE_REASONS).optional(),
  details: z.array(z.string()).readonly().optional(),
});

export type EditEntryResult = z.infer<typeof editEntryResultSchema>;

async function editKeyEntry(
  params: z.infer<typeof paramsSchema>,
  context: McpToolContext,
): Promise<EditEntryResult> {
  return editEntry(
    {
      config: context.config.config,
      cwd: context.cwd,
      locale: params.locale,
      key: params.key,
      value: params.value,
      actor: "agent",
      lockAcquireTimeoutMs: lockAcquireTimeoutMs(params.lockTimeoutMs),
    },
    {
      ...(context.fs !== undefined ? { fs: context.fs } : {}),
      ...(context.adapterRegistry !== undefined
        ? { adapterRegistry: context.adapterRegistry }
        : {}),
    },
  );
}

export const editEntryTool = defineTool({
  name: "translation.editEntry",
  values: { redact: redactWriteResult },
  description:
    "Writes one caller-supplied translation for one key in one target locale. Use it " +
    "whenever you already know the correct text: it never calls a provider and costs " +
    "nothing, so prefer it over translation.retranslateEntry. Do not use it to obtain a " +
    "translation: what is written is exactly the value you send. The required locale " +
    "parameter must be a configured target locale, the required key parameter must exist in " +
    "the source, and the required value parameter is the new text, capped at 20000 " +
    "characters. The value is accepted only if it passes the integrity gate (it carries the " +
    "source's placeholders, parses as valid ICU, and is not empty or degenerate); a " +
    "rejection is returned as accepted: false with a reason and writes nothing, so correct " +
    "the value rather than resending it. An accepted value overwrites the locale file and " +
    "its lock entry at once, with no undo, and is recorded with origin agent in " +
    "verbatra.provenance.json, so a key the last run flagged stays in review.queue. A key " +
    "matching the config's pinnedKeys is refused with KEY_PINNED: it is reserved for a " +
    "person. " +
    LOCK_TIMEOUT_DESCRIPTION +
    "Always listed: it needs no spend capability.",
  paramsSchema,
  outputSchema: editEntryResultSchema,
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: false,
  },
  handler: editKeyEntry,
});
