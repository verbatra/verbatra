import { localeIntegrity } from "@verbatra/sdk";
import { z } from "zod";
import type { McpToolContext } from "../types.js";
import { defineTool } from "./define-tool.js";
import {
  keyIntegrityEntrySchema,
  toKeyIntegrityEntry,
  withoutIntegrityDetails,
} from "./key-integrity.js";

const paramsSchema = z.strictObject({
  locales: z.array(z.string().min(1)).min(1).optional(),
});

const localeIntegrityResultSchema = z.object({
  locales: z.array(
    z.object({
      locale: z.string(),
      entries: z.array(keyIntegrityEntrySchema.extend({ key: z.string() })),
    }),
  ),
});

type LocaleIntegrityResult = z.infer<typeof localeIntegrityResultSchema>;

async function checkLocaleIntegrity(
  params: z.infer<typeof paramsSchema>,
  context: McpToolContext,
): Promise<LocaleIntegrityResult> {
  const results = await localeIntegrity(
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
  return {
    locales: results.map((locale) => ({
      locale: locale.locale,
      entries: locale.entries.map((entry) => ({ key: entry.key, ...toKeyIntegrityEntry(entry) })),
    })),
  };
}

export const localeIntegrityTool = defineTool({
  name: "locale.integrity",
  values: {
    redact: (result) => ({
      locales: result.locales.map((locale) => ({
        ...locale,
        entries: locale.entries.map(withoutIntegrityDetails),
      })),
    }),
  },
  description:
    "Lists every translation in the target locales that is broken right now: a value that lost " +
    "or gained a source placeholder or inline markup, no longer parses as ICU MessageFormat, or " +
    "carries ICU plural, ordinal, or select arms that do not fit the target language. Use it to " +
    "find every integrity problem in one call, for instance before deciding which keys to fix or " +
    "retranslate, rather than calling key.integrity key by key. Every key present in both the " +
    "source and a target locale is judged, whatever its sync state, and only failing keys are " +
    "listed, so an empty entries list means every translation of that locale passes; a missing " +
    "key has no translation to judge and never appears. The optional locales parameter narrows " +
    "the report to the named target locales, and omitting it covers every configured target " +
    "locale. Each entry carries the key, the boolean outcomes, the placeholder or markup tokens " +
    "involved, and one short problem per wrong arm, never a full source or target string. " +
    "Read-only: it calls no provider and writes nothing.",
  paramsSchema,
  outputSchema: localeIntegrityResultSchema,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  handler: checkLocaleIntegrity,
});
