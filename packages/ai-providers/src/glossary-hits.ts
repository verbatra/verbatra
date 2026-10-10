import { foldGlossaryCase, type LocaleGlossary } from "./glossary.js";
import { occursAsWholeTerm } from "./whole-term.js";

export function glossaryEntriesInText(
  glossary: LocaleGlossary,
  text: string,
  textLocale: string,
): LocaleGlossary {
  const occurs = (term: string, caseSensitive: boolean): boolean =>
    occursAsWholeTerm(
      foldGlossaryCase(text, textLocale, caseSensitive),
      foldGlossaryCase(term, textLocale, caseSensitive),
    );
  return {
    terms: glossary.terms.filter((term) => occurs(term.source, term.caseSensitive)),
    doNotTranslate: glossary.doNotTranslate.filter((entry) =>
      occurs(entry.term, entry.caseSensitive),
    ),
  };
}
