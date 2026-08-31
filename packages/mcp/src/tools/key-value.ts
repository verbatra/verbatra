import { keyValue } from "@verbatra/sdk";
import { z } from "zod";
import type { McpToolContext } from "../types.js";
import { defineTool } from "./define-tool.js";

const paramsSchema = z.strictObject({
  locale: z.string().min(1),
  key: z.string().min(1),
});

const keyValueResultSchema = z.strictObject({
  source: z.string(),
  target: z.string().optional(),
});

type KeyValueResult = z.infer<typeof keyValueResultSchema>;

async function readKeyValue(
  params: z.infer<typeof paramsSchema>,
  context: McpToolContext,
): Promise<KeyValueResult> {
  return keyValue(
    { config: context.config.config, cwd: context.cwd, locale: params.locale, key: params.key },
    {
      ...(context.fs !== undefined ? { fs: context.fs } : {}),
      ...(context.adapterRegistry !== undefined
        ? { adapterRegistry: context.adapterRegistry }
        : {}),
    },
  );
}

export const keyValueTool = defineTool({
  name: "key.value",
  description:
    "Read one key's current source text and, if it has been translated, its current text in one " +
    "target locale. target is absent when the key has not been translated into that locale yet. " +
    "Use this before translation.editEntry to see the current value. Read-only, calls no provider.",
  paramsSchema,
  outputSchema: keyValueResultSchema,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  handler: readKeyValue,
});
