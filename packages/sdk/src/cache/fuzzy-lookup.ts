import { normalizeText, similarityAtLeast } from "@verbatra/core";
import type { TranslationMemory } from "./types.js";

export const FUZZY_MAX_SOURCE_LENGTH = 2000;

export const FUZZY_MAX_CANDIDATES_SCORED = 256;

export interface FuzzyCacheMatch {
  readonly contentHash: string;
  readonly value: string;
  readonly previousSource: string;
  readonly similarity: number;
}

export interface FuzzyLookupOptions {
  readonly threshold: number;
  readonly score?: (left: string, right: string, threshold: number) => number | undefined;
}

interface Candidate {
  readonly contentHash: string;
  readonly value: string;
  readonly source: string;
  readonly normalized: string;
  readonly ceiling: number;
}

const NUMERAL_RUN = /\p{N}+/gu;

const RUN_SEPARATOR = ",";

function numeralRuns(text: string): string {
  return (text.match(NUMERAL_RUN) ?? []).join(RUN_SEPARATOR);
}

function numeralsDiffer(left: string, right: string): boolean {
  return numeralRuns(left) !== numeralRuns(right);
}

function lengthCeiling(left: string, right: string): number {
  const longest = Math.max(left.length, right.length);
  return longest === 0 ? 1 : Math.min(left.length, right.length) / longest;
}

function byPromiseThenHash(left: Candidate, right: Candidate): number {
  return right.ceiling - left.ceiling || left.contentHash.localeCompare(right.contentHash);
}

function usableCandidate(
  memory: TranslationMemory,
  contentHash: string,
  value: string,
  query: string,
  threshold: number,
): Candidate | undefined {
  const source = memory.sources[contentHash];
  if (source === undefined || source.length > FUZZY_MAX_SOURCE_LENGTH) {
    return undefined;
  }
  const normalized = normalizeText(source);
  if (normalized === query || numeralsDiffer(normalized, query)) {
    return undefined;
  }
  const ceiling = lengthCeiling(normalized, query);
  return ceiling < threshold ? undefined : { contentHash, value, source, normalized, ceiling };
}

function collectCandidates(
  memory: TranslationMemory,
  bucket: Readonly<Record<string, string>>,
  query: string,
  threshold: number,
): readonly Candidate[] {
  const candidates: Candidate[] = [];
  for (const [contentHash, value] of Object.entries(bucket)) {
    const candidate = usableCandidate(memory, contentHash, value, query, threshold);
    if (candidate !== undefined) {
      candidates.push(candidate);
    }
  }
  return candidates.sort(byPromiseThenHash).slice(0, FUZZY_MAX_CANDIDATES_SCORED);
}

function bestOf(
  candidates: readonly Candidate[],
  query: string,
  options: FuzzyLookupOptions,
): FuzzyCacheMatch | undefined {
  const score = options.score ?? similarityAtLeast;
  let best: FuzzyCacheMatch | undefined;
  for (const candidate of candidates) {
    const similarity = score(candidate.normalized, query, options.threshold);
    if (similarity === undefined || similarity < options.threshold) {
      continue;
    }
    if (best === undefined || similarity > best.similarity) {
      best = {
        contentHash: candidate.contentHash,
        value: candidate.value,
        previousSource: candidate.source,
        similarity,
      };
    }
  }
  return best;
}

export function findFuzzyMatch(
  memory: TranslationMemory,
  fingerprint: string,
  locale: string,
  sourceText: string,
  options: FuzzyLookupOptions,
): FuzzyCacheMatch | undefined {
  if (sourceText.length > FUZZY_MAX_SOURCE_LENGTH) {
    return undefined;
  }
  const bucket = memory.entries[fingerprint]?.[locale];
  if (bucket === undefined) {
    return undefined;
  }
  const query = normalizeText(sourceText);
  return bestOf(collectCandidates(memory, bucket, query, options.threshold), query, options);
}
