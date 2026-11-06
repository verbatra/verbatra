import type { GlossaryTermView } from "../shared/rpc/glossary.js";
import { buildTermEdit, type TermDraft } from "./glossary-editing.js";

export interface AddDraft {
  readonly term: string;
  readonly translation: string;
}

export interface KeepDraft {
  readonly term: string;
  readonly caseSensitive: boolean;
}

export const EMPTY_ADD_DRAFT: AddDraft = { term: "", translation: "" };

export const EMPTY_KEEP_DRAFT: KeepDraft = { term: "", caseSensitive: true };

export type TermDrafts = Readonly<Record<string, TermDraft>>;

export function isAddDirty(draft: AddDraft): boolean {
  return draft.term.trim().length > 0 || draft.translation.trim().length > 0;
}

export function isKeepDirty(draft: KeepDraft): boolean {
  return draft.term.trim().length > 0;
}

export function dirtyEditorSources(
  terms: readonly GlossaryTermView[],
  scope: string,
  drafts: TermDrafts,
): readonly string[] {
  return terms
    .filter((term) => {
      const draft = drafts[term.source];
      return draft !== undefined && buildTermEdit(term, scope, draft) !== undefined;
    })
    .map((term) => term.source);
}

const LISTED_LIMIT = 3;

export function describeDirtyDrafts(input: {
  readonly editors: readonly string[];
  readonly add: boolean;
  readonly keep: boolean;
}): string {
  const labels = [
    ...input.editors.map((source) => `the edit of "${source}"`),
    ...(input.add ? ["the new term"] : []),
    ...(input.keep ? ["the new do-not-translate term"] : []),
  ];
  const listed = labels.slice(0, LISTED_LIMIT).join(", ");
  const more = labels.length - LISTED_LIMIT;
  return more > 0 ? `${listed} and ${more} more` : listed;
}
