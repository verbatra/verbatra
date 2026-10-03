import {
  checkGlossaryDraft,
  type GlossaryDraftCheck,
  glossaryEntriesInText,
  type LocaleGlossary,
} from "@verbatra/ai-providers";
import { type Glossary, type GlossaryInput, glossaryForLocale } from "./glossary.js";

const NO_HITS: LocaleGlossary = { terms: [], doNotTranslate: [] };

/** Input for {@link glossaryHits}. */
export interface GlossaryHitsInput {
  /** The config's glossary, in either supported shape or already normalized, or `undefined`. */
  readonly glossary: GlossaryInput | Glossary | undefined;
  /** The target locale whose translations and forbidden renderings apply. */
  readonly locale: string;
  /** The locale the text is written in, used to fold case for a term matched without case. */
  readonly sourceLocale: string;
  /** The source text to look for terms in. */
  readonly text: string;
}

/**
 * Finds the glossary entries that apply to one source text in one target locale: every term whose
 * source occurs in the text, with the translation and forbidden renderings that locale is held to,
 * and every term to keep untranslated that occurs in it. A term matches as a whole term only, so
 * `cart` does not match inside `carts`, and with or without case as the term says. It reads and
 * writes nothing.
 *
 * This is the same matching a translate run uses to decide that a translation missed a glossary
 * term, so a caller can show a translator the terminology a key is held to before it is written.
 *
 * @param input - The glossary, the target and source locales, and the source text.
 * @returns The matching terms and terms to keep untranslated, both empty when nothing matches.
 */
export function glossaryHits(input: GlossaryHitsInput): LocaleGlossary {
  const localeGlossary = glossaryForLocale(input.glossary, input.locale);
  return localeGlossary === undefined
    ? NO_HITS
    : glossaryEntriesInText(localeGlossary, input.text, input.sourceLocale);
}

/** Input for {@link glossaryDraftCheck}. */
export interface GlossaryDraftCheckInput {
  /** The config's glossary, in either supported shape or already normalized, or `undefined`. */
  readonly glossary: GlossaryInput | Glossary | undefined;
  /** The target locale the draft is written in. */
  readonly locale: string;
  /** The locale the source text is written in. */
  readonly sourceLocale: string;
  /** The key's source text. */
  readonly source: string;
  /** The draft translation to check. */
  readonly draft: string;
}

/**
 * Checks a draft translation against the glossary entries that apply to its source text, before it
 * is written: whether each required translation is used, which forbidden renderings appear, and
 * whether each term to keep untranslated survived. It reads and writes nothing.
 *
 * The rules are the ones a translate run uses to flag a translation for review with
 * `GLOSSARY_TERM_MISSED` and `GLOSSARY_FORBIDDEN_TERM`, so a translator can see the same verdict
 * while typing. Only the entries {@link glossaryHits} finds in the source text are checked.
 *
 * @param input - The glossary, the two locales, the source text, and the draft.
 * @returns One verdict per applying term and per applying term to keep untranslated.
 */
export function glossaryDraftCheck(input: GlossaryDraftCheckInput): GlossaryDraftCheck {
  return checkGlossaryDraft({
    hits: glossaryHits({
      glossary: input.glossary,
      locale: input.locale,
      sourceLocale: input.sourceLocale,
      text: input.source,
    }),
    sourceValue: input.source,
    draft: input.draft,
    targetLocale: input.locale,
  });
}
