import { foldGlossaryCase, type LocaleGlossary } from "./glossary.js";
import { occursAsWholeTerm } from "./whole-term.js";

export interface GlossaryTermRule {
  readonly caseSensitive: boolean;
}

export function sourceTermOccurs(
  sourceValue: string,
  term: string,
  sourceLocale: string,
  rule: GlossaryTermRule,
): boolean {
  return occursAsWholeTerm(
    foldGlossaryCase(sourceValue, sourceLocale, rule.caseSensitive),
    foldGlossaryCase(term, sourceLocale, rule.caseSensitive),
  );
}

export function requiredTermUsed(
  translatedValue: string,
  target: string,
  targetLocale: string,
  rule: GlossaryTermRule,
): boolean {
  return foldGlossaryCase(translatedValue, targetLocale, rule.caseSensitive).includes(
    foldGlossaryCase(target, targetLocale, rule.caseSensitive),
  );
}

export function forbiddenRenderingUsed(
  translatedValue: string,
  sourceValue: string,
  rendering: string,
  targetLocale: string,
  rule: GlossaryTermRule,
): boolean {
  const folded = foldGlossaryCase(rendering, targetLocale, rule.caseSensitive);
  return (
    occursAsWholeTerm(
      foldGlossaryCase(translatedValue, targetLocale, rule.caseSensitive),
      folded,
    ) && !occursAsWholeTerm(foldGlossaryCase(sourceValue, targetLocale, rule.caseSensitive), folded)
  );
}

/** How a draft translation treats one glossary term whose source occurs in the source text. */
export interface GlossaryDraftTermCheck {
  /** The source-language term. */
  readonly source: string;
  /** The translation the target locale requires. Absent when the term only forbids renderings. */
  readonly target?: string;
  /** Whether the draft contains the required translation. Absent when `target` is. */
  readonly targetUsed?: boolean;
  /** The forbidden renderings the draft uses and the source text does not. Empty when none. */
  readonly forbiddenUsed: readonly string[];
}

/** Whether a draft translation keeps one term that must stay untranslated. */
export interface GlossaryDraftDoNotTranslateCheck {
  /** The term to keep untranslated. */
  readonly term: string;
  /** Whether the draft still contains the term as written. */
  readonly kept: boolean;
}

/** A draft translation checked against the glossary entries that apply to its source text. */
export interface GlossaryDraftCheck {
  /** One verdict per glossary term whose source occurs in the source text. */
  readonly terms: readonly GlossaryDraftTermCheck[];
  /** One verdict per term to keep untranslated that occurs in the source text. */
  readonly doNotTranslate: readonly GlossaryDraftDoNotTranslateCheck[];
}

export interface GlossaryDraftInput {
  readonly hits: LocaleGlossary;
  readonly sourceValue: string;
  readonly draft: string;
  readonly targetLocale: string;
}

export function checkGlossaryDraft(input: GlossaryDraftInput): GlossaryDraftCheck {
  return {
    terms: input.hits.terms.map((term) => {
      const forbiddenUsed = term.forbidden.filter((rendering) =>
        forbiddenRenderingUsed(input.draft, input.sourceValue, rendering, input.targetLocale, term),
      );
      if (term.target === undefined || term.target === "") {
        return { source: term.source, forbiddenUsed };
      }
      return {
        source: term.source,
        target: term.target,
        targetUsed: requiredTermUsed(input.draft, term.target, input.targetLocale, term),
        forbiddenUsed,
      };
    }),
    doNotTranslate: input.hits.doNotTranslate.map((entry) => ({
      term: entry.term,
      kept: requiredTermUsed(input.draft, entry.term, input.targetLocale, entry),
    })),
  };
}
