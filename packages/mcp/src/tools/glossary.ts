import { readGlossaryFile, redact, updateGlossaryTerm } from "@verbatra/sdk";
import { z } from "zod";
import type { McpToolContext } from "../types.js";
import { resolveGlossaryProvenance } from "./config-projection.js";
import { defineTool } from "./define-tool.js";

const MAX_GLOSSARY_TERM_LENGTH = 200;
const MAX_GLOSSARY_TRANSLATION_LENGTH = 2_000;

const glossaryIndicatorSchema = z.discriminatedUnion("source", [
  z.strictObject({ source: z.literal("none") }),
  z.strictObject({ source: z.literal("inline") }),
  z.strictObject({ source: z.literal("file"), path: z.string() }),
]);

const glossaryResultSchema = z.strictObject({
  indicator: glossaryIndicatorSchema,
  entries: z.record(z.string(), z.string()),
  redactedTerms: z.array(z.string()),
});

type GlossaryResult = z.infer<typeof glossaryResultSchema>;

const glossaryGetParamsSchema = z.strictObject({});

const glossaryWriteParamsSchema = z.strictObject({
  term: z.string().min(1).max(MAX_GLOSSARY_TERM_LENGTH),
  translation: z.string().min(1).max(MAX_GLOSSARY_TRANSLATION_LENGTH).nullable(),
});

async function currentEntries(context: McpToolContext): Promise<Readonly<Record<string, string>>> {
  if (context.config.glossary.source === "file") {
    return readGlossaryFile(
      { glossary: context.config.glossary },
      context.fs !== undefined ? { fs: context.fs } : {},
    );
  }
  return context.config.config.glossary ?? {};
}

function buildResult(
  context: McpToolContext,
  entries: Readonly<Record<string, string>>,
): GlossaryResult {
  const redactedEntries: Record<string, string> = {};
  const redactedTerms: string[] = [];
  for (const [term, value] of Object.entries(entries)) {
    const safe = redact(value);
    redactedEntries[term] = safe;
    if (safe !== value) {
      redactedTerms.push(term);
    }
  }
  return {
    indicator: resolveGlossaryProvenance(context.config.glossary, context.cwd),
    entries: redactedEntries,
    redactedTerms,
  };
}

async function glossaryGet(
  _params: z.infer<typeof glossaryGetParamsSchema>,
  context: McpToolContext,
): Promise<GlossaryResult> {
  return buildResult(context, await currentEntries(context));
}

async function glossaryWrite(
  params: z.infer<typeof glossaryWriteParamsSchema>,
  context: McpToolContext,
): Promise<GlossaryResult> {
  const entries = await updateGlossaryTerm(
    {
      glossary: context.config.glossary,
      cwd: context.cwd,
      term: params.term,
      translation: params.translation,
    },
    context.fs !== undefined ? { fs: context.fs } : {},
  );
  return buildResult(context, entries);
}

export const glossaryGetTool = defineTool({
  name: "glossary.get",
  description:
    "Read the project glossary: every configured term and its translation, plus where the " +
    "glossary comes from (inline in the config, or a file, with its path). Every value passes " +
    "through secret redaction first, so a value shaped like a provider API key is returned as " +
    "[REDACTED] rather than its real text, and redactedTerms names exactly which terms that " +
    "happened to. Never write back a value this tool reported as redacted, since it is a " +
    "placeholder, not the original text. Read-only, calls no provider.",
  paramsSchema: glossaryGetParamsSchema,
  outputSchema: glossaryResultSchema,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  handler: glossaryGet,
});

export const glossaryWriteTool = defineTool({
  name: "glossary.write",
  description:
    "Add, replace, or remove one glossary term. Pass translation as a non-empty string to set or " +
    "replace the term, or null to remove it. Writes to the glossary file (or the in-memory " +
    "config for an inline glossary) and returns the full glossary afterward, in the same " +
    "redacted shape glossary.get returns. This changes what a future translation of any key " +
    "using this term will produce; it does not call a provider or retranslate existing keys " +
    "itself.",
  paramsSchema: glossaryWriteParamsSchema,
  outputSchema: glossaryResultSchema,
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  handler: glossaryWrite,
});
