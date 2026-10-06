import { diff, keyOriginSchema } from "@verbatra/sdk";
import { z } from "zod";
import type { McpToolContext } from "../types.js";
import { defineTool } from "./define-tool.js";

const paramsSchema = z.strictObject({
  locales: z.array(z.string().min(1)).min(1).optional(),
});

const localeDiffSchema = z.object({
  locale: z.string(),
  missing: z.array(z.string()).readonly(),
  changed: z.array(z.string()).readonly(),
  orphaned: z.array(z.string()).readonly(),
  hasPendingChanges: z.boolean(),
  emptySource: z.array(z.string()).readonly().optional(),
  changedOrigins: z.record(z.string(), keyOriginSchema).optional(),
  protected: z.array(z.string()).readonly().optional(),
});

const statusDiffResultSchema = z.object({
  hasPendingChanges: z.boolean(),
  locales: z.array(localeDiffSchema).readonly(),
});

export type StatusDiffResult = z.infer<typeof statusDiffResultSchema>;

async function statusDiff(
  params: z.infer<typeof paramsSchema>,
  context: McpToolContext,
): Promise<StatusDiffResult> {
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
  values: "none",
  description:
    "Lists, per target locale, the exact keys that the next translate run would add, " +
    "re-translate, or leave orphaned. Use it after status.check when you need the key names " +
    "behind the counts, and to show a person what translation.translatePending would change " +
    "before asking to spend on it. Do not use it as a content view: it returns key names, " +
    "never translated values, and the lists are uncapped, so a large project returns a " +
    "large result. The optional locales parameter narrows the diff to the named target " +
    "locales; omit it to cover every configured target locale. Each locale also carries " +
    "changedOrigins, the origin of every changed key's current value (for example human, " +
    "import, or external), so you can see whose work a re-translation would replace; it is " +
    "absent when verbatra.provenance.json is corrupt or from a newer verbatra. protected " +
    "lists the missing and changed keys a translate run would leave alone for a person, " +
    "under the config's humanEdits and pinnedKeys; when that file is unreadable it lists " +
    "only the pinned keys. emptySource lists the source keys whose value is empty or " +
    "whitespace only: they are not pending, a translate run sends nothing for them, and they " +
    "need a person to write the source text. Read-only: it calls no provider and writes " +
    "nothing.",
  paramsSchema,
  outputSchema: statusDiffResultSchema,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  handler: statusDiff,
});
