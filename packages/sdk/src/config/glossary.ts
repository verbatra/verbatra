import {
  type DoNotTranslateTerm,
  foldGlossaryCase,
  type LocaleGlossary,
  type LocaleGlossaryTerm,
} from "@verbatra/ai-providers";
import { z } from "zod";
import { localeCodeSchema } from "./locale-code.js";

export const MAX_GLOSSARY_TERM_LENGTH = 200;
export const MAX_GLOSSARY_TRANSLATION_LENGTH = 2_000;
export const MAX_GLOSSARY_NOTE_LENGTH = 500;
export const MAX_GLOSSARY_PART_OF_SPEECH_LENGTH = 50;

const NOT_BLANK = /\S/;

function glossaryText(max: number) {
  return z.string().max(max).regex(NOT_BLANK, { message: "must not be blank" });
}

/** One term of a version 2 glossary, as it is written in the glossary file or the config. */
export interface GlossaryTermDefinition {
  /** The source-language term. */
  readonly source: string;
  /** The translation every target locale uses unless {@link GlossaryTermDefinition.targets} names its own. */
  readonly target?: string | undefined;
  /**
   * Translations for particular target locales, keyed by locale code. A locale uses its own entry,
   * then the entry for its base language (`de` also covers `de-AT`), then `target`.
   */
  readonly targets?: Readonly<Record<string, string>> | undefined;
  /**
   * Renderings a target locale must never use, keyed by locale code. A locale is held to the list
   * for its own code and the list for its base language.
   */
  readonly forbidden?: Readonly<Record<string, readonly string[]>> | undefined;
  /** Whether the term, its translations, and its forbidden renderings are matched with case. Defaults to `false`. */
  readonly caseSensitive?: boolean | undefined;
  /** Free-text context for the term, sent to an LLM provider as disambiguation data only. */
  readonly note?: string | undefined;
  /** The term's part of speech, free text, sent to an LLM provider as disambiguation data only. */
  readonly partOfSpeech?: string | undefined;
}

/**
 * A term to keep untranslated in every locale, written either as the bare term, which is matched
 * with case, or as an object that sets case sensitivity explicitly.
 */
export type GlossaryDoNotTranslateDefinition =
  | string
  | {
      /** The term to keep untranslated. */
      readonly term: string;
      /** Whether the term is matched with case. Defaults to `true`. */
      readonly caseSensitive?: boolean | undefined;
    };

/** A version 2 glossary as it is written in the glossary file or inline in the config. */
export interface GlossaryDefinition {
  /** The glossary format version. Always `2`. */
  readonly version: 2;
  /** The glossary's terms, each with its translations, forbidden renderings, and context. */
  readonly terms: readonly GlossaryTermDefinition[];
  /**
   * Terms, such as brand names, to copy into every translation untranslated. A bare string must also
   * keep its letter case; an object with `caseSensitive: false` need not.
   */
  readonly doNotTranslate?: readonly GlossaryDoNotTranslateDefinition[] | undefined;
}

/**
 * A glossary in either supported shape: a version 1 flat map from source term to the translation
 * every target locale uses, or a version 2 {@link GlossaryDefinition}.
 */
export type GlossaryInput = Readonly<Record<string, string>> | GlossaryDefinition;

export type Version1Entries = readonly (readonly [string, string])[];

/** One term of a {@link Glossary}, with every default filled in. */
export interface GlossaryTerm {
  /** The source-language term. */
  readonly source: string;
  /** The translation for every target locale without an entry of its own in `targets`. */
  readonly target?: string;
  /** Translations for particular target locales, keyed by locale code as written. */
  readonly targets: Readonly<Record<string, string>>;
  /** Forbidden renderings, keyed by locale code as written. */
  readonly forbidden: Readonly<Record<string, readonly string[]>>;
  /** Whether the term, its translations, and its forbidden renderings are matched with case. */
  readonly caseSensitive: boolean;
  /** Free-text context for the term. */
  readonly note?: string;
  /** The term's part of speech, free text. */
  readonly partOfSpeech?: string;
}

/** A glossary in its normalized form, whichever version it was written in. */
export interface Glossary {
  /** The format the glossary was written in: `1` for a flat term map, `2` for a {@link GlossaryDefinition}. */
  readonly version: 1 | 2;
  /** Every term, in the order it was written. */
  readonly terms: readonly GlossaryTerm[];
  /** Every term to keep untranslated, in the order it was written. */
  readonly doNotTranslate: readonly DoNotTranslateTerm[];
}

const localeRecord = <T extends z.ZodType>(value: T) => z.record(localeCodeSchema, value);

const glossaryTermDefinitionSchema = z.strictObject({
  source: glossaryText(MAX_GLOSSARY_TERM_LENGTH),
  target: glossaryText(MAX_GLOSSARY_TRANSLATION_LENGTH).optional(),
  targets: localeRecord(glossaryText(MAX_GLOSSARY_TRANSLATION_LENGTH)).optional(),
  forbidden: localeRecord(z.array(glossaryText(MAX_GLOSSARY_TRANSLATION_LENGTH)).min(1)).optional(),
  caseSensitive: z.boolean().optional(),
  note: glossaryText(MAX_GLOSSARY_NOTE_LENGTH).optional(),
  partOfSpeech: glossaryText(MAX_GLOSSARY_PART_OF_SPEECH_LENGTH).optional(),
});

const doNotTranslateDefinitionSchema = z.union([
  glossaryText(MAX_GLOSSARY_TERM_LENGTH),
  z.strictObject({
    term: glossaryText(MAX_GLOSSARY_TERM_LENGTH),
    caseSensitive: z.boolean().optional(),
  }),
]);

interface GlossaryIssue {
  readonly message: string;
  readonly path: readonly (string | number)[];
}

export function localeKey(code: string): string {
  try {
    return (Intl.getCanonicalLocales(code)[0] ?? code).toLowerCase();
  } catch {
    return code.toLowerCase();
  }
}

function duplicateLocaleIssues(
  record: Readonly<Record<string, unknown>> | undefined,
  path: readonly (string | number)[],
): GlossaryIssue[] {
  const seen = new Set<string>();
  const issues: GlossaryIssue[] = [];
  for (const locale of Object.keys(record ?? {})) {
    const key = localeKey(locale);
    if (seen.has(key)) {
      issues.push({ message: `names the locale "${locale}" twice`, path: [...path, locale] });
    }
    seen.add(key);
  }
  return issues;
}

function localesNamedBy(term: GlossaryTerm): readonly string[] {
  const byKey = new Map<string, string>();
  for (const locale of [...Object.keys(term.targets), ...Object.keys(term.forbidden)]) {
    if (!byKey.has(localeKey(locale))) {
      byKey.set(localeKey(locale), locale);
    }
  }
  return [...byKey.values()];
}

function forbiddenTargetIssues(definition: GlossaryTermDefinition, index: number): GlossaryIssue[] {
  const term = normalizeTerm(definition);
  const issues: GlossaryIssue[] = [];
  for (const locale of localesNamedBy(term)) {
    const target = resolveTarget(term, localeKey(locale));
    if (target === undefined) {
      continue;
    }
    const folded = foldGlossaryCase(target, locale, term.caseSensitive);
    const clash = resolveForbidden(term, localeKey(locale)).find(
      (rendering) => foldGlossaryCase(rendering, locale, term.caseSensitive) === folded,
    );
    if (clash !== undefined) {
      issues.push({
        message: `forbids "${clash}" for "${locale}", where "${target}" is its required translation`,
        path: ["terms", index, "forbidden"],
      });
    }
  }
  return issues;
}

export function isEmptyTerm(term: GlossaryTermDefinition): boolean {
  return (
    term.target === undefined &&
    Object.keys(term.targets ?? {}).length === 0 &&
    Object.keys(term.forbidden ?? {}).length === 0
  );
}

function termIssues(terms: readonly GlossaryTermDefinition[]): GlossaryIssue[] {
  const issues: GlossaryIssue[] = [];
  const sources = new Set<string>();
  terms.forEach((term, index) => {
    if (sources.has(term.source)) {
      issues.push({
        message: `repeats the term "${term.source}"`,
        path: ["terms", index, "source"],
      });
    }
    sources.add(term.source);
    if (isEmptyTerm(term)) {
      issues.push({
        message: `gives the term "${term.source}" no translation and no forbidden rendering`,
        path: ["terms", index],
      });
    }
    issues.push(
      ...duplicateLocaleIssues(term.targets, ["terms", index, "targets"]),
      ...duplicateLocaleIssues(term.forbidden, ["terms", index, "forbidden"]),
      ...forbiddenTargetIssues(term, index),
    );
  });
  return issues;
}

function doNotTranslateTermOf(entry: GlossaryDoNotTranslateDefinition): DoNotTranslateTerm {
  return typeof entry === "string"
    ? { term: entry, caseSensitive: true }
    : { term: entry.term, caseSensitive: entry.caseSensitive ?? true };
}

function doNotTranslateIssues(definition: GlossaryDefinition): GlossaryIssue[] {
  const issues: GlossaryIssue[] = [];
  const sources = new Set(definition.terms.map((term) => term.source));
  const seen = new Set<string>();
  (definition.doNotTranslate ?? []).forEach((entry, index) => {
    const { term } = doNotTranslateTermOf(entry);
    if (seen.has(term)) {
      issues.push({ message: `repeats the term "${term}"`, path: ["doNotTranslate", index] });
    }
    if (sources.has(term)) {
      issues.push({
        message: `keeps "${term}" untranslated, but it is also a glossary term`,
        path: ["doNotTranslate", index],
      });
    }
    seen.add(term);
  });
  return issues;
}

export function glossaryDefinitionIssues(definition: GlossaryDefinition): readonly GlossaryIssue[] {
  return [...termIssues(definition.terms), ...doNotTranslateIssues(definition)];
}

export const glossaryDefinitionSchema = z
  .strictObject({
    version: z.literal(2),
    terms: z.array(glossaryTermDefinitionSchema),
    doNotTranslate: z.array(doNotTranslateDefinitionSchema).optional(),
  })
  .superRefine((definition, ctx) => {
    for (const issue of glossaryDefinitionIssues(definition)) {
      ctx.addIssue({ code: "custom", message: issue.message, path: [...issue.path] });
    }
  });

interface DescribedIssue {
  readonly message: string;
  readonly path: readonly PropertyKey[];
}

function recordOf(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : undefined;
}

export function version1Entries(value: unknown): Version1Entries | undefined {
  const record = recordOf(value);
  if (record === undefined) {
    return undefined;
  }
  const entries: (readonly [string, string])[] = [];
  for (const [term, translation] of Object.entries(record)) {
    if (typeof translation !== "string") {
      return undefined;
    }
    entries.push([term, translation]);
  }
  return entries;
}

export function rawLocaleKeyIssues(definition: unknown): readonly GlossaryIssue[] {
  const terms = recordOf(definition)?.terms;
  if (!Array.isArray(terms)) {
    return [];
  }
  return terms.flatMap((term: unknown, index) =>
    (["targets", "forbidden"] as const).flatMap((field) => {
      const record = recordOf(recordOf(term)?.[field]);
      return Object.keys(record ?? {})
        .filter((locale) => !localeCodeSchema.safeParse(locale).success)
        .map((locale) => ({
          message: `names "${locale}", which is not a locale code`,
          path: ["terms", index, field, locale],
        }));
    }),
  );
}

export function describeGlossaryIssues(issues: readonly DescribedIssue[]): string {
  return issues
    .map((issue) => {
      const path = issue.path.map(String).join(".");
      return path.length > 0 ? `${path}: ${issue.message}` : issue.message;
    })
    .join("; ");
}

export function isGlossaryDefinition(glossary: GlossaryInput): glossary is GlossaryDefinition {
  return Array.isArray((glossary as { readonly terms?: unknown }).terms);
}

function normalizeTerm(term: GlossaryTermDefinition): GlossaryTerm {
  return {
    source: term.source,
    ...(term.target !== undefined ? { target: term.target } : {}),
    targets: Object.fromEntries(Object.entries(term.targets ?? {})),
    forbidden: Object.fromEntries(Object.entries(term.forbidden ?? {})),
    caseSensitive: term.caseSensitive ?? false,
    ...(term.note !== undefined ? { note: term.note } : {}),
    ...(term.partOfSpeech !== undefined ? { partOfSpeech: term.partOfSpeech } : {}),
  };
}

function normalizeVersion1(record: Readonly<Record<string, string>>): Glossary {
  return {
    version: 1,
    terms: Object.entries(record).map(([source, target]) => ({
      source,
      target,
      targets: {},
      forbidden: {},
      caseSensitive: false,
    })),
    doNotTranslate: [],
  };
}

const normalized = new WeakMap<object, Glossary>();

/**
 * Converts a glossary in either supported shape to its normalized {@link Glossary} form, filling in
 * every default. A version 1 flat map becomes version 1 terms whose `target` applies to every
 * locale. The input is not validated again; {@link loadConfig} and {@link verbatraConfigSchema}
 * already have.
 *
 * @param glossary - A version 1 term map or a version 2 {@link GlossaryDefinition}.
 * @returns The normalized glossary.
 */
export function normalizeGlossary(glossary: GlossaryInput): Glossary {
  const cached = normalized.get(glossary);
  if (cached !== undefined) {
    return cached;
  }
  const result: Glossary = isGlossaryDefinition(glossary)
    ? {
        version: 2,
        terms: glossary.terms.map(normalizeTerm),
        doNotTranslate: (glossary.doNotTranslate ?? []).map(doNotTranslateTermOf),
      }
    : normalizeVersion1(glossary);
  normalized.set(glossary, result);
  return result;
}

function baseLanguage(key: string): string {
  return key.split("-")[0] ?? key;
}

function entryFor<T>(record: Readonly<Record<string, T>>, key: string): T | undefined {
  for (const [locale, value] of Object.entries(record)) {
    if (localeKey(locale) === key) {
      return value;
    }
  }
  return undefined;
}

function resolveTarget(term: GlossaryTerm, key: string): string | undefined {
  return entryFor(term.targets, key) ?? entryFor(term.targets, baseLanguage(key)) ?? term.target;
}

function resolveForbidden(term: GlossaryTerm, key: string): readonly string[] {
  const exact = entryFor(term.forbidden, key) ?? [];
  const base = key === baseLanguage(key) ? [] : (entryFor(term.forbidden, baseLanguage(key)) ?? []);
  return [...new Set([...exact, ...base])];
}

function localeTerm(term: GlossaryTerm, key: string): LocaleGlossaryTerm | undefined {
  const target = resolveTarget(term, key);
  const forbidden = resolveForbidden(term, key);
  if (target === undefined && forbidden.length === 0) {
    return undefined;
  }
  return {
    source: term.source,
    ...(target !== undefined ? { target } : {}),
    forbidden,
    caseSensitive: term.caseSensitive,
    ...(term.note !== undefined ? { note: term.note } : {}),
    ...(term.partOfSpeech !== undefined ? { partOfSpeech: term.partOfSpeech } : {}),
  };
}

/**
 * Resolves the part of a glossary that applies to one target locale: each term's translation for
 * that locale, the renderings it forbids there, and every term to keep untranslated. This is
 * exactly what a translation request into that locale carries.
 *
 * A term's translation comes from its entry for the locale, then from its entry for the locale's
 * base language, then from its `target`; locale codes are compared in canonical form, ignoring
 * case. A term with neither a translation nor a forbidden rendering for the locale is left out.
 *
 * @param glossary - The config's glossary, in either supported shape, or `undefined` for none.
 * @param locale - The target locale code.
 * @returns The glossary for that locale, or `undefined` when nothing in it applies there.
 */
export function glossaryForLocale(
  glossary: GlossaryInput | undefined,
  locale: string,
): LocaleGlossary | undefined {
  if (glossary === undefined) {
    return undefined;
  }
  const { terms, doNotTranslate } = normalizeGlossary(glossary);
  const key = localeKey(locale);
  const localeTerms = terms.flatMap((term) => localeTerm(term, key) ?? []);
  if (localeTerms.length === 0 && doNotTranslate.length === 0) {
    return undefined;
  }
  return { terms: localeTerms, doNotTranslate };
}

/**
 * Projects a glossary onto the translations every target locale shares: a map from each term that
 * has a shared `target` to that translation. Per-locale translations, forbidden renderings, and
 * terms kept untranslated are left out, so use it only where a flat term map is all a consumer can
 * show. The result's keys are own properties, so a term named `__proto__` is kept.
 *
 * @param glossary - A normalized glossary, as {@link readGlossaryFile} or {@link normalizeGlossary}
 * returns it.
 * @returns The shared translation of each term that has one, in glossary order.
 */
export function sharedGlossaryTranslations(glossary: Glossary): Readonly<Record<string, string>> {
  return Object.fromEntries(
    glossary.terms.flatMap((term) =>
      term.target !== undefined ? [[term.source, term.target]] : [],
    ),
  );
}
