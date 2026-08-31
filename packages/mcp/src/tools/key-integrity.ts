import { keyIntegrity } from "@verbatra/sdk";
import { z } from "zod";
import type { McpToolContext } from "../types.js";
import { defineTool } from "./define-tool.js";

const paramsSchema = z.strictObject({
  key: z.string().min(1),
  locales: z.array(z.string().min(1)).min(1).optional(),
});

const keyIntegrityLocaleSchema = z.strictObject({
  locale: z.string(),
  hasPlaceholders: z.boolean(),
  matches: z.boolean(),
  missing: z.array(z.string()).readonly(),
  extra: z.array(z.string()).readonly(),
  icuValid: z.boolean(),
});

const keyIntegrityResultSchema = z.strictObject({
  locales: z.array(keyIntegrityLocaleSchema),
});

type KeyIntegrityResult = z.infer<typeof keyIntegrityResultSchema>;

async function checkKeyIntegrity(
  params: z.infer<typeof paramsSchema>,
  context: McpToolContext,
): Promise<KeyIntegrityResult> {
  const results = await keyIntegrity({
    config: context.config.config,
    cwd: context.cwd,
    keys: [params.key],
    ...(params.locales !== undefined ? { locales: params.locales } : {}),
  });

  const locales: KeyIntegrityResult["locales"][number][] = [];
  for (const locale of results) {
    const entry = locale.entries[0];
    if (entry === undefined) {
      continue;
    }
    locales.push({
      locale: locale.locale,
      hasPlaceholders: entry.hasPlaceholders,
      matches: entry.matches,
      missing: entry.missing,
      extra: entry.extra,
      icuValid: entry.icuValid,
    });
  }
  return { locales };
}

export const keyIntegrityTool = defineTool({
  name: "key.integrity",
  description:
    "Check one key's placeholder and ICU integrity per target locale: whether the translation " +
    "carries exactly the source's placeholders, which are missing or extra, and whether it " +
    "parses as a valid ICU message. Use this to verify a specific key before or after editing " +
    "it. Pass locales to narrow the check to a subset of configured target locales; omit it to " +
    "check every configured target locale. Read-only, calls no provider.",
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
