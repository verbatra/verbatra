import { z } from "zod";

export const GLOSSARY_GET_METHOD = "glossary.get";

export const GLOSSARY_WRITE_METHOD = "glossary.write";

export const MAX_GLOSSARY_TERM_LENGTH = 200;

export const MAX_GLOSSARY_TRANSLATION_LENGTH = 2_000;

export const MAX_GLOSSARY_NOTE_LENGTH = 500;

export const MAX_GLOSSARY_PART_OF_SPEECH_LENGTH = 50;

export const MAX_FORBIDDEN_RENDERINGS = 50;

const MAX_LOCALE_LENGTH = 64;

export const glossaryGetParamsSchema = z.strictObject({});

export type GlossaryGetParams = z.infer<typeof glossaryGetParamsSchema>;

export const glossaryWriteParamsSchema = z.strictObject({
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
});

export type GlossaryWriteParams = z.infer<typeof glossaryWriteParamsSchema>;

export type GlossaryIndicator =
  | { readonly source: "none" }
  | { readonly source: "inline" }
  | { readonly source: "file"; readonly path: string };

export interface GlossaryLocaleView {
  readonly target?: string;
  readonly inherited: boolean;
  readonly forbidden: readonly string[];
}

export interface GlossaryTermView {
  readonly source: string;
  readonly target?: string;
  readonly targets: Readonly<Record<string, string>>;
  readonly forbidden: Readonly<Record<string, readonly string[]>>;
  readonly caseSensitive: boolean;
  readonly note?: string;
  readonly partOfSpeech?: string;
  readonly byLocale: Readonly<Record<string, GlossaryLocaleView>>;
}

export interface GlossaryDoNotTranslateView {
  readonly term: string;
  readonly caseSensitive: boolean;
}

export interface GlossaryGetResult {
  readonly indicator: GlossaryIndicator;
  readonly version: 1 | 2 | null;
  readonly locales: readonly string[];
  readonly terms: readonly GlossaryTermView[];
  readonly doNotTranslate: readonly GlossaryDoNotTranslateView[];
  readonly redactedTerms: readonly string[];
}

export type GlossaryWriteResult = GlossaryGetResult;
