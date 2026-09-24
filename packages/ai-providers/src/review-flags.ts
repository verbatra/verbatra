import type { PlaceholderIntegrityResult, TranslationEntry } from "@verbatra/core";
import { type DoNotTranslateTerm, foldGlossaryCase, type LocaleGlossary } from "./glossary.js";
import {
  forbiddenRenderingUsed,
  requiredTermUsed,
  sourceTermOccurs,
} from "./glossary-term-checks.js";
import type { ProviderNotice, ReviewFlag, ReviewReasonCode } from "./provider.js";
import { wholeTermIndices } from "./whole-term.js";

const LENGTH_RATIO_MIN = 0.35;
const LENGTH_RATIO_MAX = 3.0;
const LENGTH_RATIO_MIN_SOURCE_LENGTH = 12;
const LATIN_GRAPHEME_WEIGHT = 1;
const SCRIPT_GRAPHEME_WEIGHTS: readonly (readonly [RegExp, number])[] = [
  [/^\p{Script=Han}/u, 3.5],
  [/^[\p{Script=Hiragana}\p{Script=Katakana}]/u, 1.5],
  [/^\p{Script=Hangul}/u, 2],
];

const UNICODE_LETTER = /\p{L}/u;

const GRAPHEME_SEGMENTER = new Intl.Segmenter(undefined, { granularity: "grapheme" });

const DEGRADATION_NOTICE_CODES: ReadonlySet<ProviderNotice["code"]> = new Set([
  "FORMALITY_DOWNGRADED",
  "GLOSSARY_IGNORED",
]);

export interface ReviewFlagInput {
  readonly sourceValue: string;
  readonly translatedValue: string;
  readonly sourceLocale: string;
  readonly targetLocale: string;
  readonly integrity: PlaceholderIntegrityResult;
  readonly glossary?: LocaleGlossary | undefined;
  readonly maxLength?: number | undefined;
}

function graphemeLength(value: string): number {
  let count = 0;
  for (const _segment of GRAPHEME_SEGMENTER.segment(value)) {
    count += 1;
  }
  return count;
}

function graphemeWeight(grapheme: string): number {
  for (const [script, weight] of SCRIPT_GRAPHEME_WEIGHTS) {
    if (script.test(grapheme)) {
      return weight;
    }
  }
  return LATIN_GRAPHEME_WEIGHT;
}

export function latinEquivalentLength(value: string): number {
  let length = 0;
  for (const { segment } of GRAPHEME_SEGMENTER.segment(value)) {
    length += graphemeWeight(segment);
  }
  return length;
}

function exceedsMaxLength(value: string, maxLength: number | undefined): boolean {
  return maxLength !== undefined && graphemeLength(value) > maxLength;
}

function isLengthRatioOutlier(sourceValue: string, translatedValue: string): boolean {
  const sourceLength = latinEquivalentLength(sourceValue.trim());
  if (sourceLength < LENGTH_RATIO_MIN_SOURCE_LENGTH) {
    return false;
  }
  const ratio = latinEquivalentLength(translatedValue.trim()) / sourceLength;
  return ratio < LENGTH_RATIO_MIN || ratio > LENGTH_RATIO_MAX;
}

function removeWholeTerms(text: string, term: string): string {
  let remaining = text;
  for (const index of wholeTermIndices(text, term).reverse()) {
    remaining = `${remaining.slice(0, index)} ${remaining.slice(index + term.length)}`;
  }
  return remaining;
}

function fixedTermsOf(glossary: LocaleGlossary | undefined): readonly DoNotTranslateTerm[] {
  if (glossary === undefined) {
    return [];
  }
  const identities = glossary.terms
    .filter((term) => term.target === term.source)
    .map(({ source, caseSensitive }) => ({ term: source, caseSensitive }));
  return [...glossary.doNotTranslate, ...identities];
}

function consistsOfFixedTerms(input: ReviewFlagInput): boolean {
  const fixed = fixedTermsOf(input.glossary);
  if (fixed.length === 0) {
    return false;
  }
  let remaining = input.sourceValue;
  for (const { term } of fixed.filter((entry) => entry.caseSensitive)) {
    remaining = removeWholeTerms(remaining, term);
  }
  remaining = foldGlossaryCase(remaining, input.sourceLocale, false);
  for (const { term } of fixed.filter((entry) => !entry.caseSensitive)) {
    remaining = removeWholeTerms(remaining, foldGlossaryCase(term, input.sourceLocale, false));
  }
  return !UNICODE_LETTER.test(remaining);
}

function isEqualsSource(input: ReviewFlagInput): boolean {
  const trimmedSource = input.sourceValue.trim();
  const trimmedTranslated = input.translatedValue.trim();
  return (
    trimmedTranslated === trimmedSource &&
    input.targetLocale !== input.sourceLocale &&
    UNICODE_LETTER.test(trimmedSource) &&
    !consistsOfFixedTerms(input)
  );
}

interface ExpectedTerm {
  readonly source: string;
  readonly target: string;
  readonly caseSensitive: boolean;
}

function expectedTermsOf(glossary: LocaleGlossary): readonly ExpectedTerm[] {
  const expected: ExpectedTerm[] = [];
  for (const { source, target, caseSensitive } of glossary.terms) {
    if (target !== undefined && target !== "") {
      expected.push({ source, target, caseSensitive });
    }
  }
  for (const { term, caseSensitive } of glossary.doNotTranslate) {
    expected.push({ source: term, target: term, caseSensitive });
  }
  return expected;
}

function isGlossaryTermMissed(input: ReviewFlagInput): boolean {
  if (input.glossary === undefined) {
    return false;
  }
  return expectedTermsOf(input.glossary).some(
    (term) =>
      sourceTermOccurs(input.sourceValue, term.source, input.sourceLocale, term) &&
      !requiredTermUsed(input.translatedValue, term.target, input.targetLocale, term),
  );
}

function isForbiddenTermUsed(input: ReviewFlagInput): boolean {
  if (input.glossary === undefined) {
    return false;
  }
  return input.glossary.terms.some((term) =>
    term.forbidden.some((rendering) =>
      forbiddenRenderingUsed(
        input.translatedValue,
        input.sourceValue,
        rendering,
        input.targetLocale,
        term,
      ),
    ),
  );
}

function isIntegrityReordered(integrity: PlaceholderIntegrityResult): boolean {
  return integrity.matches && integrity.reordered;
}

export function computeReviewFlags(input: ReviewFlagInput): ReviewFlag | undefined {
  const reasons: ReviewReasonCode[] = [];
  if (isLengthRatioOutlier(input.sourceValue, input.translatedValue)) {
    reasons.push("LENGTH_RATIO_OUTLIER");
  }
  if (exceedsMaxLength(input.translatedValue, input.maxLength)) {
    reasons.push("MAX_LENGTH_EXCEEDED");
  }
  if (isEqualsSource(input)) {
    reasons.push("EQUALS_SOURCE");
  }
  if (isGlossaryTermMissed(input)) {
    reasons.push("GLOSSARY_TERM_MISSED");
  }
  if (isForbiddenTermUsed(input)) {
    reasons.push("GLOSSARY_FORBIDDEN_TERM");
  }
  if (isIntegrityReordered(input.integrity)) {
    reasons.push("INTEGRITY_REORDERED");
  }
  return reasons.length > 0 ? { status: "review", reasons } : undefined;
}

export function buildEntryReviewFlags(
  entries: readonly TranslationEntry[],
  values: ReadonlyMap<string, string>,
  integrity: ReadonlyMap<string, PlaceholderIntegrityResult>,
  sourceLocale: string,
  targetLocale: string,
  glossary: LocaleGlossary | undefined,
  maxLength: ReadonlyMap<string, number> | undefined,
): Map<string, ReviewFlag> {
  const reviewFlags = new Map<string, ReviewFlag>();
  for (const entry of entries) {
    const translatedValue = values.get(entry.key);
    const entryIntegrity = integrity.get(entry.key);
    if (translatedValue === undefined || entryIntegrity === undefined) {
      continue;
    }
    const flag = computeReviewFlags({
      sourceValue: entry.value,
      translatedValue,
      sourceLocale,
      targetLocale,
      integrity: entryIntegrity,
      glossary,
      maxLength: maxLength?.get(entry.key),
    });
    if (flag !== undefined) {
      reviewFlags.set(entry.key, flag);
    }
  }
  return reviewFlags;
}

export function applyProviderDegraded(
  reviewFlags: ReadonlyMap<string, ReviewFlag>,
  notices: readonly ProviderNotice[],
  acceptedKeys: readonly string[],
): ReadonlyMap<string, ReviewFlag> {
  if (!notices.some((notice) => DEGRADATION_NOTICE_CODES.has(notice.code))) {
    return reviewFlags;
  }
  const next = new Map(reviewFlags);
  for (const key of acceptedKeys) {
    const existing = next.get(key);
    next.set(key, {
      status: "review",
      reasons:
        existing !== undefined ? [...existing.reasons, "PROVIDER_DEGRADED"] : ["PROVIDER_DEGRADED"],
    });
  }
  return next;
}
