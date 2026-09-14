import { similarityRatio } from "@verbatra/core";
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
  readonly score?: (left: string, right: string) => number;
}

interface Candidate {
  readonly contentHash: string;
  readonly value: string;
  readonly source: string;
  readonly ceiling: number;
}

function lengthCeiling(left: string, right: string): number {
  const longest = Math.max(left.length, right.length);
  return longest === 0 ? 1 : Math.min(left.length, right.length) / longest;
}

function byPromiseThenHash(left: Candidate, right: Candidate): number {
  return right.ceiling - left.ceiling || left.contentHash.localeCompare(right.contentHash);
}

function collectCandidates(
  memory: TranslationMemory,
  bucket: Readonly<Record<string, string>>,
  sourceText: string,
  threshold: number,
): Candidate[] {
  const candidates: Candidate[] = [];
  for (const [contentHash, value] of Object.entries(bucket)) {
    const source = memory.sources[contentHash];
    if (source === undefined || source.length > FUZZY_MAX_SOURCE_LENGTH) {
      continue;
    }
    const ceiling = lengthCeiling(source, sourceText);
    if (ceiling < threshold) {
      continue;
    }
    candidates.push({ contentHash, value, source, ceiling });
  }
  return candidates.sort(byPromiseThenHash).slice(0, FUZZY_MAX_CANDIDATES_SCORED);
}

function bestOf(
  candidates: readonly Candidate[],
  sourceText: string,
  options: FuzzyLookupOptions,
): FuzzyCacheMatch | undefined {
  const score = options.score ?? similarityRatio;
  let best: FuzzyCacheMatch | undefined;
  for (const candidate of candidates) {
    const similarity = score(candidate.source, sourceText);
    if (similarity < options.threshold) {
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
  return bestOf(
    collectCandidates(memory, bucket, sourceText, options.threshold),
    sourceText,
    options,
  );
}
