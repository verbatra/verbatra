import { glossaryEntriesInText, type LocaleGlossary } from "@verbatra/ai-providers";
import { type Glossary, type GlossaryInput, glossaryForLocale } from "./glossary.js";

const NO_HITS: LocaleGlossary = { terms: [], doNotTranslate: [] };

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
 * @param glossary - The config's glossary, in either supported shape or already normalized, or
 * `undefined` for none.
 * @param locale - The target locale whose translations and forbidden renderings apply.
 * @param sourceLocale - The locale the text is written in, used to fold case for a term matched
 * without case.
 * @param text - The source text to look for terms in.
 * @returns The matching terms and terms to keep untranslated, both empty when nothing matches.
 */
export function glossaryHits(
  glossary: GlossaryInput | Glossary | undefined,
  locale: string,
  sourceLocale: string,
  text: string,
): LocaleGlossary {
  const localeGlossary = glossaryForLocale(glossary, locale);
  return localeGlossary === undefined
    ? NO_HITS
    : glossaryEntriesInText(localeGlossary, text, sourceLocale);
}
