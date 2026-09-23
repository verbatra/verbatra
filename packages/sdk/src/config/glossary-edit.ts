import { SdkError } from "../errors.js";
import {
  describeGlossaryIssues,
  type GlossaryDefinition,
  type GlossaryDoNotTranslateDefinition,
  type GlossaryTermDefinition,
  glossaryDefinitionSchema,
  isEmptyTerm,
  localeKey,
} from "./glossary.js";
import { localeCodeSchema } from "./locale-code.js";

export type Version1Entries = readonly (readonly [string, string])[];

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
      `The glossary edit for "${edit.term}" changes nothing. Pass a translation, forbidden renderings, a note, a part of speech, case sensitivity, or doNotTranslate.`,
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
): Version1Entries {
  const pairs = [...entries];
  const index = pairs.findIndex(([existing]) => existing === term);
  if (translation === null) {
    if (index >= 0) {
      pairs.splice(index, 1);
    }
  } else if (index >= 0) {
    pairs[index] = [term, translation];
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
  const kept = Object.entries(record ?? {}).filter(([existing]) => localeKey(existing) !== key);
  return Object.fromEntries(value === undefined ? kept : [...kept, [locale, value]]);
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

function editTerms(
  terms: readonly GlossaryTermDefinition[],
  edit: GlossaryEdit,
): readonly GlossaryTermDefinition[] {
  const index = terms.findIndex((term) => term.source === edit.term);
  const existing = index >= 0 ? terms[index] : undefined;
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

function editDoNotTranslate(
  entries: readonly GlossaryDoNotTranslateDefinition[],
  edit: GlossaryEdit,
): readonly GlossaryDoNotTranslateDefinition[] {
  const kept = entries.filter((entry) => doNotTranslateTermOf(entry) !== edit.term);
  if (edit.doNotTranslate !== true) {
    return kept;
  }
  const entry: GlossaryDoNotTranslateDefinition =
    edit.caseSensitive === false ? { term: edit.term, caseSensitive: false } : edit.term;
  const index = entries.findIndex((existing) => doNotTranslateTermOf(existing) === edit.term);
  return index < 0
    ? [...kept, entry]
    : entries.map((existing, at) => (at === index ? entry : existing));
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

export function applyEdit(definition: GlossaryDefinition, edit: GlossaryEdit): GlossaryDefinition {
  if (edit.doNotTranslate !== undefined) {
    const doNotTranslate = editDoNotTranslate(definition.doNotTranslate ?? [], edit);
    return validated({
      version: 2,
      terms: definition.terms,
      ...(doNotTranslate.length > 0 ? { doNotTranslate } : {}),
    });
  }
  return validated({ ...definition, terms: editTerms(definition.terms, edit) });
}
