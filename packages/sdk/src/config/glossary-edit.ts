import { foldGlossaryCase } from "@verbatra/ai-providers";
import { SdkError } from "../errors.js";
import {
  describeGlossaryIssues,
  type GlossaryDefinition,
  type GlossaryDoNotTranslateDefinition,
  type GlossaryTermDefinition,
  glossaryDefinitionSchema,
  isEmptyTerm,
  localeKey,
  type Version1Entries,
} from "./glossary.js";
import { localeCodeSchema } from "./locale-code.js";

export interface GlossaryEdit {
  readonly term: string;
  readonly translation?: string | null;
  readonly locale?: string;
  readonly forbidden?: readonly string[] | null;
  readonly note?: string | null;
  readonly partOfSpeech?: string | null;
  readonly caseSensitive?: boolean;
  readonly doNotTranslate?: boolean;
}

type TermField = "translation" | "locale" | "forbidden" | "note" | "partOfSpeech";

const TERM_FIELDS: readonly TermField[] = [
  "translation",
  "locale",
  "forbidden",
  "note",
  "partOfSpeech",
];

function invalid(message: string): SdkError {
  return new SdkError("CONFIG_INVALID", message);
}

function isBlank(value: string): boolean {
  return value.trim().length === 0;
}

function assertNotBlank(value: string | null | undefined, message: string): void {
  if (typeof value === "string" && isBlank(value)) {
    throw invalid(message);
  }
}

function hasTermField(edit: GlossaryEdit): boolean {
  return TERM_FIELDS.some((field) => edit[field] !== undefined);
}

function assertEditShape(edit: GlossaryEdit): void {
  if (edit.doNotTranslate !== undefined && hasTermField(edit)) {
    throw invalid(
      `The glossary edit for "${edit.term}" sets doNotTranslate together with a translation, locale, forbidden renderings, note, or part of speech. Keep a term untranslated in its own edit.`,
    );
  }
  if (
    edit.doNotTranslate === undefined &&
    !hasTermField(edit) &&
    edit.caseSensitive === undefined
  ) {
    throw invalid(
      `The glossary edit for "${edit.term}" sets no field. Pass a translation, forbidden renderings, a note, a part of speech, case sensitivity, or doNotTranslate.`,
    );
  }
  if (edit.forbidden !== undefined && edit.locale === undefined) {
    throw invalid(
      `Forbidden renderings for "${edit.term}" belong to one locale. Pass the locale they apply to.`,
    );
  }
  if (edit.locale !== undefined && !localeCodeSchema.safeParse(edit.locale).success) {
    throw invalid(`"${edit.locale}" is not a valid BCP 47 locale code.`);
  }
}

export function assertValidEdit(edit: GlossaryEdit): void {
  if (typeof edit.term !== "string") {
    throw invalid("A glossary term must not be blank.");
  }
  assertNotBlank(edit.term, "A glossary term must not be blank.");
  assertNotBlank(
    edit.translation,
    `The translation for the glossary term "${edit.term}" must not be blank. Remove the term instead.`,
  );
  for (const rendering of edit.forbidden ?? []) {
    assertNotBlank(rendering, `A forbidden rendering for "${edit.term}" must not be blank.`);
  }
  assertNotBlank(
    edit.note,
    `The note for "${edit.term}" must not be blank. Pass null to remove it.`,
  );
  assertNotBlank(
    edit.partOfSpeech,
    `The part of speech for "${edit.term}" must not be blank. Pass null to remove it.`,
  );
  assertEditShape(edit);
}

function storedIndex(
  sources: readonly string[],
  term: string,
  foldsCase: (index: number) => boolean,
  sourceLocale: string | undefined,
): number {
  const exact = sources.indexOf(term);
  if (exact >= 0 || sourceLocale === undefined) {
    return exact;
  }
  const folded = foldGlossaryCase(term, sourceLocale, false);
  return sources.findIndex(
    (source, index) => foldsCase(index) && foldGlossaryCase(source, sourceLocale, false) === folded,
  );
}

export function isVersion1Edit(edit: GlossaryEdit): boolean {
  return (
    edit.translation !== undefined &&
    edit.locale === undefined &&
    edit.forbidden === undefined &&
    edit.note === undefined &&
    edit.partOfSpeech === undefined &&
    edit.caseSensitive === undefined &&
    edit.doNotTranslate === undefined
  );
}

export function applyVersion1Edit(
  entries: Version1Entries,
  term: string,
  translation: string | null,
  sourceLocale: string | undefined,
): Version1Entries {
  const pairs = [...entries];
  const index = storedIndex(
    pairs.map(([existing]) => existing),
    term,
    () => true,
    sourceLocale,
  );
  const stored = pairs[index];
  if (translation === null) {
    if (stored !== undefined) {
      pairs.splice(index, 1);
    }
  } else if (stored !== undefined) {
    pairs[index] = [stored[0], translation];
  } else {
    pairs.push([term, translation]);
  }
  return pairs;
}

export function toDefinition(entries: Version1Entries): GlossaryDefinition {
  return {
    version: 2,
    terms: entries.map(([source, target]) => ({ source, target })),
  };
}

function withLocaleEntry<T>(
  record: Readonly<Record<string, T>> | undefined,
  locale: string,
  value: T | undefined,
): Readonly<Record<string, T>> {
  const key = localeKey(locale);
  const entries = Object.entries(record ?? {});
  const index = entries.findIndex(([existing]) => localeKey(existing) === key);
  if (index < 0) {
    return Object.fromEntries(value === undefined ? entries : [...entries, [locale, value]]);
  }
  const replaced: (readonly [string, T])[] = value === undefined ? [] : [[locale, value]];
  return Object.fromEntries([...entries.slice(0, index), ...replaced, ...entries.slice(index + 1)]);
}

type MutableTerm = { -readonly [K in keyof GlossaryTermDefinition]: GlossaryTermDefinition[K] };

function setOptional<K extends "target" | "note" | "partOfSpeech">(
  term: MutableTerm,
  field: K,
  value: string | null | undefined,
): void {
  if (value === null) {
    delete term[field];
  } else if (value !== undefined) {
    term[field] = value;
  }
}

function setRecord<K extends "targets" | "forbidden">(
  term: MutableTerm,
  field: K,
  record: NonNullable<GlossaryTermDefinition[K]>,
): void {
  if (Object.keys(record).length === 0) {
    delete term[field];
  } else {
    term[field] = record;
  }
}

function applyTranslation(term: MutableTerm, edit: GlossaryEdit): void {
  if (edit.translation === undefined) {
    return;
  }
  if (edit.locale === undefined) {
    setOptional(term, "target", edit.translation);
    return;
  }
  setRecord(
    term,
    "targets",
    withLocaleEntry(term.targets, edit.locale, edit.translation ?? undefined),
  );
}

function applyForbidden(term: MutableTerm, edit: GlossaryEdit): void {
  if (edit.forbidden === undefined || edit.locale === undefined) {
    return;
  }
  const renderings =
    edit.forbidden === null || edit.forbidden.length === 0 ? undefined : [...edit.forbidden];
  setRecord(term, "forbidden", withLocaleEntry(term.forbidden, edit.locale, renderings));
}

function editedTerm(existing: GlossaryTermDefinition | undefined, edit: GlossaryEdit) {
  const term: MutableTerm = { ...(existing ?? { source: edit.term }) };
  applyTranslation(term, edit);
  applyForbidden(term, edit);
  setOptional(term, "note", edit.note);
  setOptional(term, "partOfSpeech", edit.partOfSpeech);
  if (edit.caseSensitive === true) {
    term.caseSensitive = true;
  } else if (edit.caseSensitive === false) {
    delete term.caseSensitive;
  }
  return term;
}

function onlyClears(edit: GlossaryEdit): boolean {
  return (
    (edit.translation ?? null) === null &&
    (edit.forbidden ?? []).length === 0 &&
    (edit.note ?? null) === null &&
    (edit.partOfSpeech ?? null) === null &&
    edit.caseSensitive !== true
  );
}

function editTerms(
  terms: readonly GlossaryTermDefinition[],
  edit: GlossaryEdit,
  sourceLocale: string | undefined,
): readonly GlossaryTermDefinition[] {
  const index = storedIndex(
    terms.map((term) => term.source),
    edit.term,
    (candidate) => edit.caseSensitive !== true && terms[candidate]?.caseSensitive !== true,
    sourceLocale,
  );
  const existing = index >= 0 ? terms[index] : undefined;
  if (existing === undefined && onlyClears(edit)) {
    return terms;
  }
  const next = editedTerm(existing, edit);
  if (isEmptyTerm(next) && existing === undefined) {
    throw invalid(
      `The glossary term "${edit.term}" needs a translation or a forbidden rendering before it can be added.`,
    );
  }
  const kept = isEmptyTerm(next) ? [] : [next];
  if (index < 0) {
    return [...terms, ...kept];
  }
  return [...terms.slice(0, index), ...kept, ...terms.slice(index + 1)];
}

function doNotTranslateTermOf(entry: GlossaryDoNotTranslateDefinition): string {
  return typeof entry === "string" ? entry : entry.term;
}

function matchesEditedTerm(
  entry: GlossaryDoNotTranslateDefinition,
  edit: GlossaryEdit,
  sourceLocale: string | undefined,
): boolean {
  const term = doNotTranslateTermOf(entry);
  if (term === edit.term) {
    return true;
  }
  const foldsCase = typeof entry !== "string" && !entry.caseSensitive;
  return (
    sourceLocale !== undefined &&
    edit.caseSensitive !== true &&
    foldsCase &&
    foldGlossaryCase(term, sourceLocale, false) === foldGlossaryCase(edit.term, sourceLocale, false)
  );
}

function editDoNotTranslate(
  entries: readonly GlossaryDoNotTranslateDefinition[],
  edit: GlossaryEdit,
  sourceLocale: string | undefined,
): readonly GlossaryDoNotTranslateDefinition[] {
  const matches = (entry: GlossaryDoNotTranslateDefinition) =>
    matchesEditedTerm(entry, edit, sourceLocale);
  if (edit.doNotTranslate !== true) {
    return entries.filter((entry) => !matches(entry));
  }
  const entry: GlossaryDoNotTranslateDefinition =
    edit.caseSensitive === false ? { term: edit.term, caseSensitive: false } : edit.term;
  const index = entries.findIndex(matches);
  if (index < 0) {
    return [...entries, entry];
  }
  return entries.flatMap((existing, at) => {
    if (at === index) return [entry];
    return matches(existing) ? [] : [existing];
  });
}

function validated(definition: GlossaryDefinition): GlossaryDefinition {
  const result = glossaryDefinitionSchema.safeParse(definition);
  if (!result.success) {
    throw invalid(
      `The glossary edit would leave an invalid glossary: ${describeGlossaryIssues(result.error.issues)}.`,
    );
  }
  return definition;
}

export function applyEdit(
  definition: GlossaryDefinition,
  edit: GlossaryEdit,
  sourceLocale?: string,
): GlossaryDefinition {
  if (edit.doNotTranslate !== undefined) {
    const doNotTranslate = editDoNotTranslate(definition.doNotTranslate ?? [], edit, sourceLocale);
    const next: { -readonly [K in keyof GlossaryDefinition]: GlossaryDefinition[K] } = {
      ...definition,
    };
    if (doNotTranslate.length > 0) {
      next.doNotTranslate = doNotTranslate;
    } else {
      delete next.doNotTranslate;
    }
    return validated(next);
  }
  return validated({ ...definition, terms: editTerms(definition.terms, edit, sourceLocale) });
}
