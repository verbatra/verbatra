import { diffResources, type LocaleResource, type TranslationEntry } from "@verbatra/core";
import { type FormatAdapter, icuStructureChanges } from "@verbatra/format-adapters";
import { gateCandidateValue, type IntegrityGateRejection } from "./integrity-gate.js";
import {
  findLiteralMatches,
  type LiteralMatch,
  replacedLength,
  replaceMatches,
  splitsSurrogatePair,
} from "./literal-match.js";
import { isIcuMessageFormat } from "./message-arguments.js";
import {
  isPinned,
  originProtectionFor,
  type ProtectionPolicy,
  type ProvenanceView,
} from "./protection.js";

export const MAX_REPLACE_VALUE_LENGTH = 20_000;

const EXCERPT_LENGTH = 200;
const EXCERPT_LEAD = 60;

export interface ReplaceCriteria {
  readonly find: string;
  readonly replace: string;
  readonly caseSensitive: boolean;
}

export interface ReplaceAllowance {
  readonly pinned: boolean;
  readonly protected: boolean;
}

export interface LocaleFacts {
  readonly adapter: FormatAdapter;
  readonly source: LocaleResource;
  readonly staleKeys: ReadonlySet<string>;
  readonly policy: ProtectionPolicy;
  readonly provenance: ProvenanceView;
}

interface PreGateBase {
  readonly current: string;
  readonly matchStart: number;
  readonly stale: boolean;
}

export type PreGate =
  | (PreGateBase & {
      readonly verdict: "no-source-entry" | "unchanged" | "pinned" | "protected" | "too-long";
      readonly newValue: string | undefined;
      readonly alsoProtected?: true;
    })
  | (PreGateBase & {
      readonly verdict: "candidate";
      readonly newValue: string;
      readonly sourceEntry: TranslationEntry;
    });

export function structureRefusal(
  adapter: FormatAdapter,
  current: string,
  replaced: string,
  sourceEntry: TranslationEntry,
): IntegrityGateRejection | undefined {
  if (!isIcuMessageFormat(adapter.format)) {
    return undefined;
  }
  const changes = icuStructureChanges(current, replaced, sourceEntry.value);
  return changes.length === 0 ? undefined : { accepted: false, reason: "icu", details: changes };
}

export function judgeReplacement(
  facts: LocaleFacts,
  sourceEntry: TranslationEntry,
  locale: string,
  current: string,
  replaced: string,
): IntegrityGateRejection | undefined {
  const gate = gateCandidateValue(sourceEntry, replaced, facts.adapter, locale);
  return gate.accepted ? structureRefusal(facts.adapter, current, replaced, sourceEntry) : gate;
}

function settle(
  facts: LocaleFacts,
  allow: ReplaceAllowance,
  key: string,
  current: string,
  newValue: string | undefined,
  base: PreGateBase,
): PreGate {
  const sourceEntry = facts.source.entries.get(key);
  if (sourceEntry === undefined) {
    return { ...base, verdict: "no-source-entry", newValue };
  }
  if (newValue === current) {
    return { ...base, verdict: "unchanged", newValue };
  }
  const protectedByOrigin =
    !allow.protected &&
    originProtectionFor(facts.policy, facts.provenance, key, current) !== undefined;
  if (!allow.pinned && isPinned(facts.policy, key)) {
    return {
      ...base,
      verdict: "pinned",
      newValue,
      ...(protectedByOrigin ? { alsoProtected: true as const } : {}),
    };
  }
  if (protectedByOrigin) {
    return { ...base, verdict: "protected", newValue };
  }
  if (newValue === undefined) {
    return { ...base, verdict: "too-long", newValue };
  }
  return { ...base, verdict: "candidate", newValue, sourceEntry };
}

export function evaluateBeforeGate(
  facts: LocaleFacts,
  criteria: ReplaceCriteria,
  allow: ReplaceAllowance,
  key: string,
  current: string,
): PreGate | undefined {
  const matches: readonly LiteralMatch[] = findLiteralMatches(
    current,
    criteria.find,
    criteria.caseSensitive,
  );
  const first = matches[0];
  if (first === undefined) {
    return undefined;
  }
  const newValue =
    replacedLength(current, matches, criteria.replace) > MAX_REPLACE_VALUE_LENGTH
      ? undefined
      : replaceMatches(current, matches, criteria.replace);
  return settle(facts, allow, key, current, newValue, {
    current,
    matchStart: first.start,
    stale: facts.staleKeys.has(key),
  });
}

export function staleKeysOf(
  source: LocaleResource,
  target: LocaleResource,
  baseline: ReadonlyMap<string, string> | undefined,
): ReadonlySet<string> {
  return new Set(diffResources(source, target, baseline === undefined ? {} : { baseline }).changed);
}

export interface Excerpt {
  readonly text: string;
  readonly cut: boolean;
}

export function excerptAround(text: string, at: number): Excerpt {
  let start = Math.max(0, at - EXCERPT_LEAD);
  let end = Math.min(text.length, start + EXCERPT_LENGTH);
  if (splitsSurrogatePair(text, start)) {
    start += 1;
  }
  if (splitsSurrogatePair(text, end)) {
    end -= 1;
  }
  return { text: text.slice(start, end), cut: start > 0 || end < text.length };
}
