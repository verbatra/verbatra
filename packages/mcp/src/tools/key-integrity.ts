import { type KeyIntegrityEntry, keyIntegrity } from "@verbatra/sdk";
import { z } from "zod";
import type { McpToolContext } from "../types.js";
import { defineTool } from "./define-tool.js";

const paramsSchema = z.strictObject({
  key: z.string().min(1),
  locales: z.array(z.string().min(1)).min(1).optional(),
});

const keyIntegrityEntrySchema = z.object({
  hasPlaceholders: z.boolean(),
  matches: z.boolean(),
  missing: z.array(z.string()).readonly(),
  extra: z.array(z.string()).readonly(),
  icuValid: z.boolean(),
  icuArmsMatch: z.boolean(),
  icuArmDetails: z.array(z.string()).readonly(),
  markupMatches: z.boolean(),
  markupDetails: z.array(z.string()).readonly(),
});

const keyIntegrityLocaleSchema = z.object({
  locale: z.string(),
  entries: z.array(keyIntegrityEntrySchema),
});

const keyIntegrityResultSchema = z.object({
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
    icuArmsMatch: entry.icuArmsMatch,
    icuArmDetails: entry.icuArmDetails,
    markupMatches: entry.markupMatches,
    markupDetails: entry.markupDetails,
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
    "Reports one key's placeholder, inline markup, ICU syntax, and ICU plural, ordinal, and " +
    "select arm drift against the lock-file " +
    "baseline, per target locale. Use it to decide whether a translation is safe to keep, " +
    "typically before or right after rewriting one with translation.editEntry. Do not read " +
    "it as a general correctness check: it only checks keys whose source text changed since " +
    "the baseline was recorded for them. A row is returned for every locale in scope, but " +
    "its entries array is empty when the key has no baseline entry yet or its source text " +
    "still matches the baseline, which means checked and unchanged, not verified correct. " +
    "The required key parameter is the source key; the optional locales parameter narrows " +
    "the check to the named target locales, and omitting it covers every configured target " +
    "locale. The result carries only boolean outcomes, the placeholder or markup tokens " +
    "involved, and one short problem per arm that does not fit the target language " +
    "(icuArmDetails), never a full source or target string. Read-only: it calls no provider and " +
    "writes nothing.",
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
