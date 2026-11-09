import { contentHash, type LocaleResource, type TranslationEntry } from "@verbatra/core";
import type { FormatAdapter } from "@verbatra/format-adapters";
import {
  findLiteralMatches,
  type LiteralMatch,
  replacedLength,
  replaceMatches,
} from "./literal-match.js";
import {
  isPinned,
  type ProtectionPolicy,
  type ProvenanceView,
  protectionFor,
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
  readonly matchStart: number;
  readonly stale: boolean;
}

export type PreGate =
  | (PreGateBase & {
      readonly verdict: "no-source-entry" | "unchanged" | "pinned" | "protected" | "oversize";
      readonly newValue: string | undefined;
    })
  | (PreGateBase & {
      readonly verdict: "candidate";
      readonly newValue: string;
      readonly sourceEntry: TranslationEntry;
    });

const PROTECT_ORIGINS: ProtectionPolicy = { humanEdits: "protect", pinnedKeys: [] };

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
  if (!allow.pinned && isPinned(facts.policy, key)) {
    return { ...base, verdict: "pinned", newValue };
  }
  if (!allow.protected && protectionFor(PROTECT_ORIGINS, facts.provenance, key, current)) {
    return { ...base, verdict: "protected", newValue };
  }
  if (newValue === undefined) {
    return { ...base, verdict: "oversize", newValue };
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
    matchStart: first.start,
    stale: facts.staleKeys.has(key),
  });
}

export function staleKeysOf(
  source: LocaleResource,
  target: LocaleResource,
  baseline: ReadonlyMap<string, string> | undefined,
): ReadonlySet<string> {
  const stale = new Set<string>();
  if (baseline === undefined) {
    return stale;
  }
  for (const [key, sourceEntry] of source.entries) {
    const previous = baseline.get(key);
    if (
      previous !== undefined &&
      target.entries.has(key) &&
      sourceEntry.value.trim() !== "" &&
      contentHash(sourceEntry) !== previous
    ) {
      stale.add(key);
    }
  }
  return stale;
}

function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff;
}

function isLowSurrogate(code: number): boolean {
  return code >= 0xdc00 && code <= 0xdfff;
}

export interface Excerpt {
  readonly text: string;
  readonly cut: boolean;
}

export function excerptAround(text: string, at: number): Excerpt {
  let start = Math.max(0, at - EXCERPT_LEAD);
  let end = Math.min(text.length, start + EXCERPT_LENGTH);
  if (
    start > 0 &&
    isLowSurrogate(text.charCodeAt(start)) &&
    isHighSurrogate(text.charCodeAt(start - 1))
  ) {
    start += 1;
  }
  if (
    end < text.length &&
    isHighSurrogate(text.charCodeAt(end - 1)) &&
    isLowSurrogate(text.charCodeAt(end))
  ) {
    end -= 1;
  }
  return { text: text.slice(start, end), cut: start > 0 || end < text.length };
}
