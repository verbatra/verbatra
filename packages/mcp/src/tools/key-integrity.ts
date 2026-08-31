import { type KeyIntegrityEntry, keyIntegrity } from "@verbatra/sdk";
import { z } from "zod";
import type { McpToolContext } from "../types.js";
import { defineTool } from "./define-tool.js";

const paramsSchema = z.strictObject({
  key: z.string().min(1),
  locales: z.array(z.string().min(1)).min(1).optional(),
});

const keyIntegrityEntrySchema = z.strictObject({
  hasPlaceholders: z.boolean(),
  matches: z.boolean(),
  missing: z.array(z.string()).readonly(),
  extra: z.array(z.string()).readonly(),
  icuValid: z.boolean(),
});

const keyIntegrityLocaleSchema = z.strictObject({
  locale: z.string(),
  entries: z.array(keyIntegrityEntrySchema),
});

const keyIntegrityResultSchema = z.strictObject({
  locales: z.array(keyIntegrityLocaleSchema),
});

type KeyIntegrityResult = z.infer<typeof keyIntegrityResultSchema>;

function toKeyIntegrityEntry(entry: KeyIntegrityEntry): z.infer<typeof keyIntegrityEntrySchema> {
  return {
    hasPlaceholders: entry.hasPlaceholders,
    matches: entry.matches,
    missing: entry.missing,
    extra: entry.extra,
    icuValid: entry.icuValid,
  };
}

async function checkKeyIntegrity(
  params: z.infer<typeof paramsSchema>,
  context: McpToolContext,
): Promise<KeyIntegrityResult> {
  const results = await keyIntegrity(
    {
      config: context.config.config,
      cwd: context.cwd,
      keys: [params.key],
      ...(params.locales !== undefined ? { locales: params.locales } : {}),
    },
    {
      ...(context.fs !== undefined ? { fs: context.fs } : {}),
      ...(context.adapterRegistry !== undefined
        ? { adapterRegistry: context.adapterRegistry }
        : {}),
    },
  );

  return {
    locales: results.map((locale) => ({
      locale: locale.locale,
      entries: locale.entries.map(toKeyIntegrityEntry),
    })),
  };
}

export const keyIntegrityTool = defineTool({
  name: "key.integrity",
  description:
    "Report one key's placeholder and ICU drift against the lock-file baseline, per target " +
    "locale. This only checks keys whose source text has changed since the baseline was last " +
    "recorded for them; it is not a general correctness check. A row is returned for every " +
    "locale in scope, but its entries array is empty when the key has no baseline entry yet or " +
    "its source text already matches the baseline: an empty entries array means the locale was " +
    "checked and found unchanged, not that the translation was verified as correct. Pass " +
    "locales to narrow the check to a subset of configured target locales; omit it to check " +
    "every configured target locale. Read-only, calls no provider.",
  paramsSchema,
  outputSchema: keyIntegrityResultSchema,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  handler: checkKeyIntegrity,
});
