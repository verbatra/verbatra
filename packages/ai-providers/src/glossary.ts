import { z } from "zod";

/**
 * One glossary term as it applies to a single target locale: the translation that locale must use,
 * the renderings it must never use, and the context that disambiguates the term.
 */
export interface LocaleGlossaryTerm {
  /** The source-language term. */
  readonly source: string;
  /** The required translation in this locale. Absent for a term that only lists forbidden renderings. */
  readonly target?: string | undefined;
  /** Renderings of the term this locale must never use. Empty when there are none. */
  readonly forbidden: readonly string[];
  /** Whether the term, its translation, and its forbidden renderings are matched with case. */
  readonly caseSensitive: boolean;
  /** Free-text context for the term, sent to an LLM provider as disambiguation data only. */
  readonly note?: string | undefined;
  /** The term's part of speech, free text, sent to an LLM provider as disambiguation data only. */
  readonly partOfSpeech?: string | undefined;
}

/** A term that must be copied into every translation exactly as written, such as a brand name. */
export interface DoNotTranslateTerm {
  /** The term to keep untranslated. */
  readonly term: string;
  /** Whether the term is matched with case. */
  readonly caseSensitive: boolean;
}

/**
 * The part of a project glossary that applies to one target locale. The SDK resolves it per locale,
 * so a request only ever carries the terms relevant to the locale it translates into.
 */
export interface LocaleGlossary {
  /** Terms with a required translation, forbidden renderings, or both, for this locale. */
  readonly terms: readonly LocaleGlossaryTerm[];
  /** Terms to keep exactly as written in every locale. */
  readonly doNotTranslate: readonly DoNotTranslateTerm[];
}

export const localeGlossarySchema = z.object({
  terms: z.array(
    z.object({
      source: z.string().min(1),
      target: z.string().optional(),
      forbidden: z.array(z.string().min(1)),
      caseSensitive: z.boolean(),
      note: z.string().optional(),
      partOfSpeech: z.string().optional(),
    }),
  ),
  doNotTranslate: z.array(z.object({ term: z.string().min(1), caseSensitive: z.boolean() })),
});

export function appliesTerms(glossary: LocaleGlossary | undefined): boolean {
  return (
    glossary !== undefined &&
    (glossary.doNotTranslate.length > 0 || glossary.terms.some((term) => term.target !== undefined))
  );
}
