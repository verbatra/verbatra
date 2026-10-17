import type { SensitiveDetectorId } from "../config/sensitive-config.js";
import { matchesKeyGlob } from "../flow/key-glob.js";
import { detectorSpans, type TextSpan } from "./detectors.js";
import { runPattern } from "./pattern-runner.js";

export const MAX_PATTERN_SCAN_LENGTH = 2_000;

/**
 * What matched: one of the `sensitiveData.detectors` (`secret`, `email`, `iban`, `credit-card`,
 * `phone`, `ip`, `private-host`), `pattern` for one of the configured `sensitiveData.patterns`, or
 * `pattern-timeout-<n>` when the configured pattern at index `n` ran past its time limit on the
 * field. A timed-out field is treated as a finding with no known span: it is sent under `warn` and
 * withheld under `block` and `redact`.
 */
export type SensitiveFindingSource = SensitiveDetectorId | "pattern" | `pattern-timeout-${number}`;

export interface SensitiveRules {
  readonly detectors: readonly SensitiveDetectorId[];
  readonly patterns: readonly RegExp[];
  readonly allow: readonly string[];
}

export interface SensitiveSpan extends TextSpan {
  readonly sources: readonly SensitiveFindingSource[];
  readonly timedOut: boolean;
}

interface TaggedSpan extends TextSpan {
  readonly source: SensitiveFindingSource;
  readonly timedOut: boolean;
}

function isAllowed(rules: SensitiveRules, text: string, span: TaggedSpan): boolean {
  if (span.timedOut) {
    return false;
  }
  const matched = text.slice(span.start, span.end);
  const folded = matched.toLowerCase();
  return rules.allow.some((pattern) => matchesKeyGlob(pattern.toLowerCase(), folded));
}

function patternSpans(pattern: RegExp, index: number, text: string): TaggedSpan[] {
  const scanned = text.slice(0, MAX_PATTERN_SCAN_LENGTH);
  const run = runPattern(pattern, scanned);
  if (run.kind === "timed-out") {
    return [{ start: 0, end: text.length, source: `pattern-timeout-${index}`, timedOut: true }];
  }
  return run.spans.map((span) => ({ ...span, source: "pattern", timedOut: false }));
}

function taggedSpans(rules: SensitiveRules, text: string): TaggedSpan[] {
  return [
    ...rules.detectors.flatMap((id) =>
      detectorSpans(id, text).map((span) => ({ ...span, source: id, timedOut: false })),
    ),
    ...rules.patterns.flatMap((pattern, index) => patternSpans(pattern, index, text)),
  ];
}

function mergeSpans(spans: readonly TaggedSpan[]): SensitiveSpan[] {
  const sorted = [...spans].sort((left, right) => left.start - right.start || right.end - left.end);
  const merged: {
    start: number;
    end: number;
    sources: Set<SensitiveFindingSource>;
    timedOut: boolean;
  }[] = [];
  for (const span of sorted) {
    const last = merged.at(-1);
    if (last !== undefined && span.start < last.end) {
      last.end = Math.max(last.end, span.end);
      last.sources.add(span.source);
      last.timedOut = last.timedOut || span.timedOut;
    } else {
      merged.push({ ...span, sources: new Set([span.source]) });
    }
  }
  return merged.map((span) => ({
    start: span.start,
    end: span.end,
    sources: [...span.sources],
    timedOut: span.timedOut,
  }));
}

export function scanText(rules: SensitiveRules, text: string): readonly SensitiveSpan[] {
  if (text.length === 0) {
    return [];
  }
  const kept = taggedSpans(rules, text).filter((span) => !isAllowed(rules, text, span));
  return mergeSpans(kept);
}
