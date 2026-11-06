import {
  type GlossaryDoNotTranslateView,
  type GlossaryIndicator,
  type GlossaryTermView,
  type GlossaryWriteParams,
  type GlossaryWriteResult,
  MAX_FORBIDDEN_RENDERINGS,
} from "../shared/rpc/glossary.js";
import { resolveErrorCopy } from "./error-copy.js";
import type { RpcCallResult } from "./rpc-client.js";
import type { StructuredError } from "./state.js";

export type GlossaryWriteOutcome =
  | { readonly kind: "success"; readonly glossary: GlossaryWriteResult }
  | { readonly kind: "error"; readonly message: string; readonly error: StructuredError };

export function deriveGlossaryWriteOutcome(
  response: RpcCallResult<"glossary.write">,
): GlossaryWriteOutcome {
  if (!response.ok) {
    return { kind: "error", message: resolveErrorCopy(response.error), error: response.error };
  }
  return { kind: "success", glossary: response.result };
}

export function glossaryReadOnlyReason(indicator: GlossaryIndicator): string | undefined {
  if (indicator.source === "inline") {
    return (
      "This glossary is written inline in the verbatra config, which is a code module Studio will " +
      "not rewrite. Move the terms into a JSON file and set the config's glossary to that path to " +
      "edit them here."
    );
  }
  if (indicator.source === "none") {
    return (
      "This project has no glossary yet. Create a JSON file, either term to translation pairs or " +
      'a version 2 glossary with "version": 2, and set the config\'s glossary to that path to ' +
      "manage the terms here."
    );
  }
  return undefined;
}

export function glossaryIndicatorLabel(indicator: GlossaryIndicator): string {
  if (indicator.source === "file") {
    return `file (${indicator.path})`;
  }
  return indicator.source;
}

export function isGlossaryEditable(indicator: GlossaryIndicator): boolean {
  return glossaryReadOnlyReason(indicator) === undefined;
}

export const ALL_LOCALES = "all";

export interface ScopeValue {
  readonly translation: string | undefined;
  readonly inheritedFrom: string | undefined;
  readonly forbidden: readonly string[];
}

function inheritedFrom(term: GlossaryTermView, locale: string): string {
  const base = locale.split("-")[0] ?? locale;
  return base !== locale && ownEntry(term.targets, base) !== undefined ? base : "all locales";
}

export function scopeValue(term: GlossaryTermView, scope: string): ScopeValue {
  if (scope === ALL_LOCALES) {
    return { translation: term.target, inheritedFrom: undefined, forbidden: [] };
  }
  const view = term.byLocale[scope];
  const inherited = view?.target !== undefined && view.inherited;
  return {
    translation: view?.target,
    inheritedFrom: inherited ? inheritedFrom(term, scope) : undefined,
    forbidden: view?.forbidden ?? [],
  };
}

export function forbiddenRuleCount(term: GlossaryTermView): number {
  return Object.values(term.forbidden).reduce((total, renderings) => total + renderings.length, 0);
}

export function isTargetLocale(locales: readonly string[], locale: string): boolean {
  const wanted = locale.toLowerCase();
  return locales.some((candidate) => candidate.toLowerCase() === wanted);
}

function ownEntry<T>(record: Readonly<Record<string, T>>, locale: string): T | undefined {
  const wanted = locale.toLowerCase();
  return Object.entries(record).find(([key]) => key.toLowerCase() === wanted)?.[1];
}

export interface TermDraft {
  readonly translation: string;
  readonly forbidden: string;
  readonly note: string;
  readonly partOfSpeech: string;
  readonly caseSensitive: boolean;
}

export function parseRenderings(text: string): readonly string[] {
  const renderings = text
    .split(/[,\u060C\n]/)
    .map((rendering) => rendering.trim())
    .filter((rendering) => rendering.length > 0);
  return [...new Set(renderings)];
}

function ownTranslation(term: GlossaryTermView, scope: string): string {
  return (scope === ALL_LOCALES ? term.target : ownEntry(term.targets, scope)) ?? "";
}

function ownForbidden(term: GlossaryTermView, scope: string): readonly string[] {
  return scope === ALL_LOCALES ? [] : (ownEntry(term.forbidden, scope) ?? []);
}

export function draftFor(term: GlossaryTermView, scope: string): TermDraft {
  return {
    translation: ownTranslation(term, scope),
    forbidden: ownForbidden(term, scope).join(", "),
    note: term.note ?? "",
    partOfSpeech: term.partOfSpeech ?? "",
    caseSensitive: term.caseSensitive,
  };
}

function clearable(next: string, current: string): string | null | undefined {
  const trimmed = next.trim();
  if (trimmed === current) {
    return undefined;
  }
  return trimmed.length === 0 ? null : trimmed;
}

function forbiddenEdit(
  term: GlossaryTermView,
  scope: string,
  draft: TermDraft,
): readonly string[] | null | undefined {
  if (scope === ALL_LOCALES) {
    return undefined;
  }
  const next = parseRenderings(draft.forbidden);
  const current = ownForbidden(term, scope);
  if (next.join("\n") === current.join("\n")) {
    return undefined;
  }
  return next.length === 0 ? null : next;
}

export function buildTermEdit(
  term: GlossaryTermView,
  scope: string,
  draft: TermDraft,
): GlossaryWriteParams | undefined {
  const translation = clearable(draft.translation, ownTranslation(term, scope));
  const forbidden = forbiddenEdit(term, scope, draft);
  const note = clearable(draft.note, term.note ?? "");
  const partOfSpeech = clearable(draft.partOfSpeech, term.partOfSpeech ?? "");
  const perLocale = translation !== undefined || forbidden !== undefined;
  const edit: GlossaryWriteParams = {
    term: term.source,
    ...(translation !== undefined ? { translation } : {}),
    ...(perLocale && scope !== ALL_LOCALES ? { locale: scope } : {}),
    ...(forbidden !== undefined ? { forbidden: forbidden === null ? null : [...forbidden] } : {}),
    ...(note !== undefined ? { note } : {}),
    ...(partOfSpeech !== undefined ? { partOfSpeech } : {}),
    ...(draft.caseSensitive !== term.caseSensitive ? { caseSensitive: draft.caseSensitive } : {}),
  };
  return Object.keys(edit).length > 1 ? edit : undefined;
}

export function hasPerLocaleData(term: GlossaryTermView): boolean {
  return Object.keys(term.targets).length > 0 || Object.keys(term.forbidden).length > 0;
}

function withLocaleKey(keys: readonly string[], locale: string, present: boolean): string[] {
  const wanted = locale.toLowerCase();
  const rest = keys.filter((key) => key.toLowerCase() !== wanted);
  return present ? [...rest, locale] : rest;
}

export function editEmptiesTerm(term: GlossaryTermView, edit: GlossaryWriteParams): boolean {
  let hasTarget = term.target !== undefined;
  let targets = Object.keys(term.targets);
  let forbidden = Object.keys(term.forbidden);
  if (edit.translation !== undefined) {
    if (edit.locale === undefined) {
      hasTarget = edit.translation !== null;
    } else {
      targets = withLocaleKey(targets, edit.locale, edit.translation !== null);
    }
  }
  if (edit.forbidden !== undefined && edit.locale !== undefined) {
    const kept = edit.forbidden !== null && edit.forbidden.length > 0;
    forbidden = withLocaleKey(forbidden, edit.locale, kept);
  }
  return !hasTarget && targets.length === 0 && forbidden.length === 0;
}

export interface TermLoss {
  readonly translations: readonly { readonly locale: string | undefined; readonly value: string }[];
  readonly forbiddenRules: number;
  readonly note: string | undefined;
  readonly partOfSpeech: string | undefined;
  readonly caseSensitive: boolean;
}

export function termLoss(term: GlossaryTermView): TermLoss {
  const shared = term.target === undefined ? [] : [{ locale: undefined, value: term.target }];
  const own = Object.entries(term.targets).map(([locale, value]) => ({ locale, value }));
  return {
    translations: [...shared, ...own],
    forbiddenRules: forbiddenRuleCount(term),
    note: term.note,
    partOfSpeech: term.partOfSpeech,
    caseSensitive: term.caseSensitive,
  };
}

export function termExistsInScope(
  terms: readonly GlossaryTermView[],
  source: string,
  scope: string,
): GlossaryTermView | undefined {
  const existing = terms.find((term) => term.source === source);
  return existing !== undefined && ownTranslation(existing, scope) !== "" ? existing : undefined;
}

export function keptTermEntry(
  entries: readonly GlossaryDoNotTranslateView[],
  term: string,
): GlossaryDoNotTranslateView | undefined {
  return entries.find((entry) => entry.term === term);
}

function searchableText(term: GlossaryTermView): readonly string[] {
  return [
    term.source,
    term.target ?? "",
    ...Object.values(term.targets),
    ...Object.values(term.forbidden).flat(),
    term.note ?? "",
    term.partOfSpeech ?? "",
  ];
}

export function filterTerms(
  terms: readonly GlossaryTermView[],
  query: string,
): readonly GlossaryTermView[] {
  const wanted = query.trim().toLowerCase();
  if (wanted.length === 0) {
    return terms;
  }
  return terms.filter((term) =>
    searchableText(term).some((text) => text.toLowerCase().includes(wanted)),
  );
}

export function nextFocusSource(sources: readonly string[], removed: string): string | undefined {
  const index = sources.indexOf(removed);
  if (index < 0) {
    return undefined;
  }
  return sources[index + 1] ?? sources[index - 1];
}

export function exceedsForbiddenCap(text: string): boolean {
  return parseRenderings(text).length > MAX_FORBIDDEN_RENDERINGS;
}

const RETRYABLE_WRITE_CODES: ReadonlySet<string> = new Set([
  "LOCK_CONTENDED",
  "METHOD_RATE_LIMITED",
  "INTERNAL",
  "NETWORK_ERROR",
  "GLOSSARY_UNWRITABLE",
]);

export function isRetryableWriteError(error: StructuredError): boolean {
  return RETRYABLE_WRITE_CODES.has(error.code);
}
