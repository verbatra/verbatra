import type { PlaceholderIntegrityResult, TranslationEntry } from "@verbatra/core";
import type { ProviderNotice, ReviewFlag, ReviewReasonCode } from "./provider.js";

const LENGTH_RATIO_MIN = 0.35;
const LENGTH_RATIO_MAX = 3.0;
const LENGTH_RATIO_MIN_SOURCE_LENGTH = 12;

const UNICODE_LETTER = /\p{L}/u;

const SCRIPTS_WITHOUT_WORD_SEPARATORS =
  "\\p{sc=Han}\\p{sc=Hiragana}\\p{sc=Katakana}\\p{sc=Thai}\\p{sc=Lao}\\p{sc=Khmer}\\p{sc=Myanmar}\\p{sc=Tibetan}";
const WORD_JOINING = `[[\\p{L}\\p{M}\\p{N}_]--[${SCRIPTS_WITHOUT_WORD_SEPARATORS}]]`;
const WORD_JOINING_AT_START = new RegExp(`^${WORD_JOINING}`, "v");
const WORD_JOINING_AT_END = new RegExp(`${WORD_JOINING}$`, "v");

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
  readonly glossary?: Readonly<Record<string, string>> | undefined;
}

function isLengthRatioOutlier(sourceValue: string, translatedValue: string): boolean {
  const trimmedSource = sourceValue.trim();
  if (trimmedSource.length < LENGTH_RATIO_MIN_SOURCE_LENGTH) {
    return false;
  }
  const ratio = translatedValue.trim().length / trimmedSource.length;
  return ratio < LENGTH_RATIO_MIN || ratio > LENGTH_RATIO_MAX;
}

function isEqualsSource(input: ReviewFlagInput): boolean {
  const trimmedSource = input.sourceValue.trim();
  const trimmedTranslated = input.translatedValue.trim();
  return (
    trimmedTranslated === trimmedSource &&
    input.targetLocale !== input.sourceLocale &&
    UNICODE_LETTER.test(trimmedSource)
  );
}

function isPrecededByWordCharacter(text: string, index: number): boolean {
  return WORD_JOINING_AT_END.test(text.slice(Math.max(0, index - 2), index));
}

function isFollowedByWordCharacter(text: string, index: number): boolean {
  return WORD_JOINING_AT_START.test(text.slice(index, index + 2));
}

function occursAsWholeTerm(text: string, term: string): boolean {
  if (term === "") {
    return false;
  }
  const guardStart = WORD_JOINING_AT_START.test(term);
  const guardEnd = WORD_JOINING_AT_END.test(term);
  for (let index = text.indexOf(term); index !== -1; index = text.indexOf(term, index + 1)) {
    const blockedStart = guardStart && isPrecededByWordCharacter(text, index);
    const blockedEnd = guardEnd && isFollowedByWordCharacter(text, index + term.length);
    if (!blockedStart && !blockedEnd) {
      return true;
    }
  }
  return false;
}

function isGlossaryTermMissed(input: ReviewFlagInput): boolean {
  const glossary = input.glossary;
  if (glossary === undefined || Object.keys(glossary).length === 0) {
    return false;
  }
  const sourceLower = input.sourceValue.toLowerCase();
  const translatedLower = input.translatedValue.toLowerCase();
  for (const [sourceTerm, targetTerm] of Object.entries(glossary)) {
    if (targetTerm === "") {
      continue;
    }
    const sourceHit = occursAsWholeTerm(sourceLower, sourceTerm.toLowerCase());
    const targetHit = occursAsWholeTerm(translatedLower, targetTerm.toLowerCase());
    if (sourceHit && !targetHit) {
      return true;
    }
  }
  return false;
}

function isIntegrityReordered(integrity: PlaceholderIntegrityResult): boolean {
  return integrity.matches && integrity.reordered;
}

export function computeReviewFlags(input: ReviewFlagInput): ReviewFlag | undefined {
  const reasons: ReviewReasonCode[] = [];
  if (isLengthRatioOutlier(input.sourceValue, input.translatedValue)) {
    reasons.push("LENGTH_RATIO_OUTLIER");
  }
  if (isEqualsSource(input)) {
    reasons.push("EQUALS_SOURCE");
  }
  if (isGlossaryTermMissed(input)) {
    reasons.push("GLOSSARY_TERM_MISSED");
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
  glossary: Readonly<Record<string, string>> | undefined,
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
