import {
  editConfiguredGlossaryTerm,
  type Glossary,
  glossaryForLocale,
  readCurrentGlossary,
  redactGlossary,
  SdkError,
} from "@verbatra/sdk";
import { z } from "zod";
import type { McpToolContext } from "../types.js";
import { glossaryProvenanceSchema, resolveGlossaryProvenance } from "./config-projection.js";
import { defineTool } from "./define-tool.js";
import {
  LOCK_TIMEOUT_DESCRIPTION,
  lockAcquireTimeoutMs,
  lockTimeoutMsSchema,
} from "./lock-timeout.js";

const MAX_GLOSSARY_TERM_LENGTH = 200;
const MAX_GLOSSARY_TRANSLATION_LENGTH = 2_000;
const MAX_GLOSSARY_NOTE_LENGTH = 500;
const MAX_GLOSSARY_PART_OF_SPEECH_LENGTH = 50;
const MAX_FORBIDDEN_RENDERINGS = 50;
const MAX_LOCALE_LENGTH = 64;

const localeTermSchema = z.object({
  source: z.string(),
  target: z.string().optional(),
  forbidden: z.array(z.string()),
  caseSensitive: z.boolean(),
  note: z.string().optional(),
  partOfSpeech: z.string().optional(),
});

const doNotTranslateSchema = z.object({ term: z.string(), caseSensitive: z.boolean() });

const glossaryResultSchema = z.object({
  indicator: glossaryProvenanceSchema,
  version: z.union([z.literal(1), z.literal(2)]).nullable(),
  terms: z.array(
    z.object({
      source: z.string(),
      target: z.string().optional(),
      targets: z.record(z.string(), z.string()),
      forbidden: z.record(z.string(), z.array(z.string())),
      caseSensitive: z.boolean(),
      note: z.string().optional(),
      partOfSpeech: z.string().optional(),
    }),
  ),
  doNotTranslate: z.array(doNotTranslateSchema),
  redactedTerms: z.array(z.string()),
  effective: z
    .object({
      locale: z.string(),
      terms: z.array(localeTermSchema),
      doNotTranslate: z.array(doNotTranslateSchema),
    })
    .optional(),
});

type GlossaryResult = z.infer<typeof glossaryResultSchema>;

const glossaryGetParamsSchema = z.strictObject({
  locale: z.string().min(1).max(MAX_LOCALE_LENGTH).optional(),
});

const glossaryWriteParamsSchema = z.strictObject({
  term: z.string().min(1).max(MAX_GLOSSARY_TERM_LENGTH),
  translation: z.string().min(1).max(MAX_GLOSSARY_TRANSLATION_LENGTH).nullable().optional(),
  locale: z.string().min(1).max(MAX_LOCALE_LENGTH).optional(),
  forbidden: z
    .array(z.string().min(1).max(MAX_GLOSSARY_TRANSLATION_LENGTH))
    .max(MAX_FORBIDDEN_RENDERINGS)
    .nullable()
    .optional(),
  note: z.string().min(1).max(MAX_GLOSSARY_NOTE_LENGTH).nullable().optional(),
  partOfSpeech: z.string().min(1).max(MAX_GLOSSARY_PART_OF_SPEECH_LENGTH).nullable().optional(),
  caseSensitive: z.boolean().optional(),
  doNotTranslate: z.boolean().optional(),
  lockTimeoutMs: lockTimeoutMsSchema,
});

const EMPTY_GLOSSARY: Glossary = { version: 2, terms: [], doNotTranslate: [] };

function fsDeps(context: McpToolContext): { readonly fs?: NonNullable<McpToolContext["fs"]> } {
  return context.fs !== undefined ? { fs: context.fs } : {};
}

function effectiveFor(glossary: Glossary, locale: string): GlossaryResult["effective"] {
  const slice = glossaryForLocale(glossary, locale);
  return {
    locale,
    terms: (slice?.terms ?? []).map((term) => ({ ...term, forbidden: [...term.forbidden] })),
    doNotTranslate: [...(slice?.doNotTranslate ?? [])],
  };
}

function buildResult(
  context: McpToolContext,
  loaded: Glossary | undefined,
  locale: string | undefined,
): GlossaryResult {
  const { glossary, redactedTerms } = redactGlossary(loaded ?? EMPTY_GLOSSARY);
  return {
    indicator: resolveGlossaryProvenance(context.config.glossary, context.cwd),
    version: loaded === undefined ? null : loaded.version,
    terms: glossary.terms.map((term) => ({
      ...term,
      targets: { ...term.targets },
      forbidden: Object.fromEntries(
        Object.entries(term.forbidden).map(([key, renderings]) => [key, [...renderings]]),
      ),
    })),
    doNotTranslate: [...glossary.doNotTranslate],
    redactedTerms: [...redactedTerms],
    ...(locale !== undefined ? { effective: effectiveFor(glossary, locale) } : {}),
  };
}

function assertTargetLocale(context: McpToolContext, locale: string): void {
  const configured = context.config.config.targetLocales;
  if (!configured.includes(locale)) {
    throw new SdkError(
      "UNKNOWN_LOCALE",
      `Requested locale not in the configured target locales: ${locale}. ` +
        `Configured targets: ${configured.join(", ")}.`,
    );
  }
}

async function glossaryGet(
  params: z.infer<typeof glossaryGetParamsSchema>,
  context: McpToolContext,
): Promise<GlossaryResult> {
  if (params.locale !== undefined) {
    assertTargetLocale(context, params.locale);
  }
  const glossary = await readCurrentGlossary({ loaded: context.config }, fsDeps(context));
  return buildResult(context, glossary, params.locale);
}

async function glossaryWrite(
  params: z.infer<typeof glossaryWriteParamsSchema>,
  context: McpToolContext,
): Promise<GlossaryResult> {
  const { lockTimeoutMs, ...edit } = params;
  const glossary = await editConfiguredGlossaryTerm(
    {
      ...edit,
      loaded: context.config,
      cwd: context.cwd,
      lockAcquireTimeoutMs: lockAcquireTimeoutMs(lockTimeoutMs),
    },
    fsDeps(context),
  );
  return buildResult(context, glossary, params.locale);
}

export const glossaryGetTool = defineTool({
  name: "glossary.get",
  description:
    "Reads the project glossary: every term with its translation for all locales (target), its " +
    "per-locale translations (targets), the renderings each locale must never use (forbidden), " +
    "case sensitivity, note and part of speech, plus the terms kept untranslated " +
    "(doNotTranslate), the glossary format version, and where the glossary comes from. Pass a " +
    "configured target locale as locale to also get effective: exactly the terms a translation " +
    "into that locale is held to, after falling back from the locale to its base language to " +
    "the shared translation. Use it before writing or reviewing a translation to learn the " +
    "terminology it must follow, and before glossary.write to see whether the glossary can be " +
    "changed at all (only a file-backed one can). Every source term, translation, forbidden " +
    "rendering, note, part of speech and term kept untranslated passes through secret " +
    "redaction, and redactedTerms names each term that had one replaced by [REDACTED], a " +
    "redacted source term itself as [REDACTED]; never write such a value back. A file-backed glossary is " +
    "read fresh on every call. Read-only: it calls no provider and writes nothing.",
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
    "Changes one glossary term and returns the whole glossary afterwards, in the shape " +
    "glossary.get returns. Pass term plus any of: translation (a string sets it, null clears " +
    "it; without locale it is the translation for all locales, and clearing it leaves the " +
    "term's per-locale data in place, the term being removed once nothing else is left), locale " +
    "(a configured target locale that translation and forbidden apply to), forbidden (the " +
    "renderings that locale must never use, replacing any listed before; null or an empty list " +
    "clears them), note and partOfSpeech (context for the translator; null clears), and " +
    "caseSensitive. To keep a term untranslated in every locale pass doNotTranslate: true, and " +
    "false to stop; it cannot be combined with any field but caseSensitive. Use it to correct or extend " +
    "terminology; it does not retranslate existing keys, so a changed term only affects later " +
    "translations. It needs a file-backed glossary: an inline glossary or none fails with " +
    "GLOSSARY_NOT_FILE_BACKED, and an edit that would leave an invalid glossary fails with " +
    "CONFIG_INVALID and writes nothing. A version 1 file is rewritten as version 2 only when " +
    "the edit needs it. " +
    LOCK_TIMEOUT_DESCRIPTION +
    "Writes the glossary file, calls no provider, and spends nothing.",
  paramsSchema: glossaryWriteParamsSchema,
  outputSchema: glossaryResultSchema,
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: false,
  },
  handler: glossaryWrite,
});
