import type { LocaleGlossary, LocaleGlossaryTerm, ProviderKind } from "@verbatra/ai-providers";
import type { TranslationEntry } from "@verbatra/core";
import { isMachineProvider } from "../config/provider-config.js";
import { kindOf } from "../config/provider-kind.js";
import type { VerbatraConfig } from "../config/schema.js";
import {
  DEFAULT_SENSITIVE_DETECTORS,
  type SensitiveDataConfig,
} from "../config/sensitive-config.js";
import {
  type SensitiveFindingSource,
  type SensitiveRules,
  type SensitiveSpan,
  scanText,
} from "./scan-text.js";
import { redactValue, replaceSpans } from "./tokens.js";

/**
 * Where a `sensitiveData` match was found in a key: its key name, its source value, or the
 * description or meaning the source file carries for it.
 */
export type SensitiveField = "key" | "value" | "description" | "meaning";

export type GuardedMode = "warn" | "block" | "redact";

export interface SensitiveFinding {
  readonly fields: readonly SensitiveField[];
  readonly sources: readonly SensitiveFindingSource[];
}

export type EntryVerdict =
  | { readonly action: "send"; readonly finding?: SensitiveFinding }
  | {
      readonly action: "redact";
      readonly finding: SensitiveFinding;
      readonly entry: TranslationEntry;
      readonly originals: readonly string[];
    }
  | { readonly action: "withhold"; readonly finding: SensitiveFinding };

export interface GlossaryVerdict {
  readonly flagged: number;
  readonly sources: readonly SensitiveFindingSource[];
  readonly send: LocaleGlossary | undefined;
}

export interface SensitiveGuard {
  readonly mode: GuardedMode;
  readonly scansEveryField: boolean;
  entry(entry: TranslationEntry): EntryVerdict;
  glossary(glossary: LocaleGlossary | undefined): GlossaryVerdict;
}

const REDACTED_CONTEXT = "[redacted]";

export function sensitiveRules(config: SensitiveDataConfig | undefined): SensitiveRules {
  return {
    detectors: config?.detectors ?? DEFAULT_SENSITIVE_DETECTORS,
    patterns: (config?.patterns ?? []).map((source) => new RegExp(source, "gu")),
    allow: config?.allow ?? [],
  };
}

type FieldSpans = ReadonlyMap<SensitiveField, readonly SensitiveSpan[]>;

function entryFields(
  entry: TranslationEntry,
  scansEveryField: boolean,
): ReadonlyArray<readonly [SensitiveField, string | undefined]> {
  if (!scansEveryField) {
    return [["value", entry.value]];
  }
  return [
    ["key", entry.key],
    ["value", entry.value],
    ["description", entry.description],
    ["meaning", entry.meaning],
  ];
}

export function scanEntryFields(
  rules: SensitiveRules,
  entry: TranslationEntry,
  scansEveryField: boolean,
): FieldSpans {
  const spans = new Map<SensitiveField, readonly SensitiveSpan[]>();
  for (const [field, text] of entryFields(entry, scansEveryField)) {
    const found = text === undefined ? [] : scanText(rules, text);
    if (found.length > 0) {
      spans.set(field, found);
    }
  }
  return spans;
}

function sourcesOf(spans: Iterable<readonly SensitiveSpan[]>): SensitiveFindingSource[] {
  const sources = new Set<SensitiveFindingSource>();
  for (const list of spans) {
    for (const span of list) {
      for (const source of span.sources) {
        sources.add(source);
      }
    }
  }
  return [...sources].sort();
}

export function findingOf(spans: FieldSpans): SensitiveFinding | undefined {
  if (spans.size === 0) {
    return undefined;
  }
  return { fields: [...spans.keys()], sources: sourcesOf(spans.values()) };
}

function redactContext(
  text: string | undefined,
  spans: readonly SensitiveSpan[] | undefined,
): string | undefined {
  return text === undefined || spans === undefined
    ? text
    : replaceSpans(text, spans, () => REDACTED_CONTEXT);
}

function redactEntry(entry: TranslationEntry, spans: FieldSpans, finding: SensitiveFinding) {
  const valueSpans = spans.get("value") ?? [];
  const value = redactValue(entry.value, valueSpans, entry.placeholders);
  if (value === undefined) {
    return { action: "withhold", finding } as const;
  }
  const description = redactContext(entry.description, spans.get("description"));
  const meaning = redactContext(entry.meaning, spans.get("meaning"));
  const redacted: TranslationEntry = {
    ...entry,
    value: value.text,
    placeholders: [...entry.placeholders, ...value.tokens],
    ...(description !== undefined ? { description } : {}),
    ...(meaning !== undefined ? { meaning } : {}),
  };
  return { action: "redact", finding, entry: redacted, originals: value.originals } as const;
}

function hasUnknownSpan(spans: FieldSpans): boolean {
  return [...spans.values()].some((list) => list.some((span) => span.timedOut));
}

function decideEntry(mode: GuardedMode, entry: TranslationEntry, spans: FieldSpans): EntryVerdict {
  const finding = findingOf(spans);
  if (finding === undefined) {
    return { action: "send" };
  }
  if (mode === "warn") {
    return { action: "send", finding };
  }
  if (mode === "block" || spans.has("key") || hasUnknownSpan(spans)) {
    return { action: "withhold", finding };
  }
  return redactEntry(entry, spans, finding);
}

export function termTexts(term: LocaleGlossaryTerm): readonly (string | undefined)[] {
  return [term.source, term.target, ...term.forbidden, term.note, term.partOfSpeech];
}

export function textsHit(
  rules: SensitiveRules,
  texts: readonly (string | undefined)[],
): SensitiveSpan[] {
  return texts.flatMap((text) => (text === undefined ? [] : [...scanText(rules, text)]));
}

function decideGlossary(
  rules: SensitiveRules,
  mode: GuardedMode,
  glossary: LocaleGlossary,
): GlossaryVerdict {
  const hits: SensitiveSpan[][] = [];
  const keep = (texts: readonly (string | undefined)[]): boolean => {
    const found = textsHit(rules, texts);
    if (found.length > 0) {
      hits.push(found);
    }
    return found.length === 0 || mode === "warn";
  };
  const terms = glossary.terms.filter((term) => keep(termTexts(term)));
  const doNotTranslate = glossary.doNotTranslate.filter((term) => keep([term.term]));
  const dropped = terms.length < glossary.terms.length;
  const send =
    dropped || doNotTranslate.length < glossary.doNotTranslate.length
      ? { terms, doNotTranslate }
      : glossary;
  return { flagged: hits.length, sources: sourcesOf(hits), send };
}

function entryIdentity(entry: TranslationEntry): string {
  return JSON.stringify([
    entry.namespace,
    entry.key,
    entry.value,
    entry.description ?? null,
    entry.meaning ?? null,
    entry.placeholders,
  ]);
}

const NOTHING_FLAGGED: GlossaryVerdict = { flagged: 0, sources: [], send: undefined };

export function createSensitiveGuard(
  config: SensitiveDataConfig | undefined,
  providerKind: ProviderKind,
): SensitiveGuard | undefined {
  if (config === undefined || config.mode === "off") {
    return undefined;
  }
  const mode = config.mode;
  const rules = sensitiveRules(config);
  const scansEveryField = providerKind === "llm";
  const entries = new Map<string, EntryVerdict>();
  const glossaries = new WeakMap<LocaleGlossary, GlossaryVerdict>();
  return {
    mode,
    scansEveryField,
    entry(entry) {
      const identity = entryIdentity(entry);
      const known = entries.get(identity);
      if (known !== undefined) {
        return known;
      }
      const verdict = decideEntry(mode, entry, scanEntryFields(rules, entry, scansEveryField));
      entries.set(identity, verdict);
      return verdict;
    },
    glossary(glossary) {
      if (glossary === undefined) {
        return NOTHING_FLAGGED;
      }
      if (!scansEveryField) {
        return { flagged: 0, sources: [], send: glossary };
      }
      const known = glossaries.get(glossary);
      if (known !== undefined) {
        return known;
      }
      const verdict = decideGlossary(rules, mode, glossary);
      glossaries.set(glossary, verdict);
      return verdict;
    },
  };
}

export function sensitiveGuardFor(config: VerbatraConfig): SensitiveGuard | undefined {
  return isMachineProvider(config.provider)
    ? createSensitiveGuard(config.sensitiveData, kindOf(config.provider.id))
    : undefined;
}
