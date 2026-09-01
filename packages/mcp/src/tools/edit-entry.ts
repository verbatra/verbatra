import { editEntry } from "@verbatra/sdk";
import { z } from "zod";
import type { McpToolContext } from "../types.js";
import { defineTool } from "./define-tool.js";

const paramsSchema = z.strictObject({
  locale: z.string().min(1),
  key: z.string().min(1),
  value: z.string().max(20_000),
});

const integrityGateReasonSchema = z.enum(["placeholder", "icu", "degenerate", "empty"]);

const editEntryResultSchema = z.object({
  accepted: z.boolean(),
  value: z.string(),
  reason: integrityGateReasonSchema.optional(),
});

type EditEntryResult = z.infer<typeof editEntryResultSchema>;

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
  description:
    "Write a manual translation for one key in one target locale, without calling a provider. " +
    "The value is accepted only if it passes the integrity gate (it carries the source's " +
    "placeholders, parses as valid ICU, and is not empty or degenerate); a rejection is returned " +
    "as accepted: false with a reason, not an error, so you can see why and retry with a " +
    "corrected value. Writes the locale file on disk when accepted.",
  paramsSchema,
  outputSchema: editEntryResultSchema,
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  handler: editKeyEntry,
});
