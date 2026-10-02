import { matchSpans } from "@verbatra/ai-providers";
import type { SensitiveDetectorId } from "../config/sensitive-config.js";
import { matchesKeyGlob } from "../flow/key-glob.js";
import { detectorSpans, type TextSpan } from "./detectors.js";

export const MAX_PATTERN_SCAN_LENGTH = 2_000;

/**
 * What matched: one of the `sensitiveData.detectors` (`secret`, `email`, `iban`, `credit-card`,
 * `phone`, `ip`, `private-host`), or `pattern` for one of the configured `sensitiveData.patterns`.
 */
export type SensitiveFindingSource = SensitiveDetectorId | "pattern";

export interface SensitiveRules {
  readonly detectors: readonly SensitiveDetectorId[];
  readonly patterns: readonly RegExp[];
  readonly allow: readonly string[];
}

export interface SensitiveSpan extends TextSpan {
  readonly sources: readonly SensitiveFindingSource[];
}

interface TaggedSpan extends TextSpan {
  readonly source: SensitiveFindingSource;
}

function isAllowed(rules: SensitiveRules, matched: string): boolean {
  const folded = matched.toLowerCase();
  return rules.allow.some((pattern) => matchesKeyGlob(pattern.toLowerCase(), folded));
}

function taggedSpans(rules: SensitiveRules, text: string): TaggedSpan[] {
  return [
    ...rules.detectors.flatMap((id) =>
      detectorSpans(id, text).map((span) => ({ ...span, source: id })),
    ),
    ...rules.patterns.flatMap((pattern) =>
      matchSpans(pattern, text.slice(0, MAX_PATTERN_SCAN_LENGTH)).map(
        (span): TaggedSpan => ({ ...span, source: "pattern" }),
      ),
    ),
  ];
}

function mergeSpans(spans: readonly TaggedSpan[]): SensitiveSpan[] {
  const sorted = [...spans].sort((left, right) => left.start - right.start || right.end - left.end);
  const merged: { start: number; end: number; sources: Set<SensitiveFindingSource> }[] = [];
  for (const span of sorted) {
    const last = merged.at(-1);
    if (last !== undefined && span.start < last.end) {
      last.end = Math.max(last.end, span.end);
      last.sources.add(span.source);
    } else {
      merged.push({ start: span.start, end: span.end, sources: new Set([span.source]) });
    }
  }
  return merged.map((span) => ({ start: span.start, end: span.end, sources: [...span.sources] }));
}

export function scanText(rules: SensitiveRules, text: string): readonly SensitiveSpan[] {
  if (text.length === 0) {
    return [];
  }
  const kept = taggedSpans(rules, text).filter(
    (span) => !isAllowed(rules, text.slice(span.start, span.end)),
  );
  return mergeSpans(kept);
}
