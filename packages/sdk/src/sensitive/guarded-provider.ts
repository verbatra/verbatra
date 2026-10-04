import {
  LENGTH_REVIEW_REASONS,
  lengthReviewReasons,
  type ReviewFlag,
  type TranslateRequest,
  type TranslateResult,
  type TranslationProvider,
} from "@verbatra/ai-providers";
import type { PlaceholderIntegrityResult, TranslationEntry } from "@verbatra/core";
import {
  reapplyForeignPlaceholders,
  withoutForeignPlaceholders,
} from "../flow/foreign-placeholders.js";
import type { SensitiveFinding, SensitiveGuard } from "./guard.js";
import type { SensitiveFindingSource } from "./scan-text.js";
import { restoreTokens } from "./tokens.js";

export type SensitiveWithheld = ReadonlyMap<string, readonly SensitiveFindingSource[]>;

const WITHHELD_BY_RESULT = new WeakMap<TranslateResult, SensitiveWithheld>();

const NONE_WITHHELD: SensitiveWithheld = new Map();

export function sensitiveWithheldOf(result: TranslateResult): SensitiveWithheld {
  return WITHHELD_BY_RESULT.get(result) ?? NONE_WITHHELD;
}

interface Redaction {
  readonly source: string;
  readonly originals: readonly string[];
  readonly finding: SensitiveFinding;
}

interface GuardedBatch {
  readonly entries: readonly TranslationEntry[];
  readonly redactions: ReadonlyMap<string, Redaction>;
  readonly withheld: Map<string, readonly SensitiveFindingSource[]>;
}

function guardBatch(guard: SensitiveGuard, entries: readonly TranslationEntry[]): GuardedBatch {
  const sent: TranslationEntry[] = [];
  const redactions = new Map<string, Redaction>();
  const withheld = new Map<string, readonly SensitiveFindingSource[]>();
  for (const entry of entries) {
    const verdict = guard.entry(withoutForeignPlaceholders(entry));
    if (verdict.action === "withhold") {
      withheld.set(entry.key, verdict.finding.sources);
    } else if (verdict.action === "redact") {
      sent.push(reapplyForeignPlaceholders(verdict.entry, entry));
      redactions.set(entry.key, {
        source: entry.value,
        originals: verdict.originals,
        finding: verdict.finding,
      });
    } else {
      sent.push(entry);
    }
  }
  return { entries: sent, redactions, withheld };
}

function guardedRequest(
  guard: SensitiveGuard,
  request: TranslateRequest,
  entries: readonly TranslationEntry[],
): TranslateRequest {
  const { glossary: _glossary, ...rest } = request;
  const glossary = guard.glossary(request.glossary).send;
  return glossary === undefined ? { ...rest, entries } : { ...rest, entries, glossary };
}

function keepKeys<T>(map: ReadonlyMap<string, T> | undefined, keys: ReadonlySet<string>) {
  return new Map([...(map ?? [])].filter(([key]) => keys.has(key)));
}

function restoredReviewFlag(
  flag: ReviewFlag | undefined,
  redaction: Redaction,
  restored: string,
  maxLength: number | undefined,
): ReviewFlag | undefined {
  const reasons = [
    ...lengthReviewReasons(redaction.source, restored, maxLength),
    ...(flag?.reasons ?? []).filter((reason) => !LENGTH_REVIEW_REASONS.has(reason)),
  ];
  return reasons.length > 0 ? { status: "review", reasons } : undefined;
}

function restoreReviewFlags(
  result: TranslateResult,
  batch: GuardedBatch,
  values: ReadonlyMap<string, string>,
  request: TranslateRequest,
): Map<string, ReviewFlag> {
  const reviewFlags = new Map<string, ReviewFlag>();
  for (const [key, value] of values) {
    const flag = result.reviewFlags?.get(key);
    const redaction = batch.redactions.get(key);
    const restored =
      redaction === undefined
        ? flag
        : restoredReviewFlag(flag, redaction, value, request.maxLength?.get(key));
    if (restored !== undefined) {
      reviewFlags.set(key, restored);
    }
  }
  return reviewFlags;
}

function restoreResult(
  result: TranslateResult,
  batch: GuardedBatch,
  request: TranslateRequest,
): TranslateResult {
  const values = new Map<string, string>();
  for (const [key, value] of result.values) {
    const redaction = batch.redactions.get(key);
    const restored = redaction === undefined ? value : restoreTokens(value, redaction.originals);
    if (restored !== undefined) {
      values.set(key, restored);
    } else if (redaction !== undefined) {
      batch.withheld.set(key, redaction.finding.sources);
    }
  }
  const kept = new Set(values.keys());
  const integrity: Map<string, PlaceholderIntegrityResult> = keepKeys(result.integrity, kept);
  const reviewFlags = restoreReviewFlags(result, batch, values, request);
  return recorded({ ...result, values, integrity, reviewFlags }, batch.withheld);
}

function recorded(result: TranslateResult, withheld: SensitiveWithheld): TranslateResult {
  if (withheld.size > 0) {
    WITHHELD_BY_RESULT.set(result, withheld);
  }
  return result;
}

export function guardProvider(
  inner: TranslationProvider,
  guard: SensitiveGuard,
): TranslationProvider {
  return {
    id: inner.id,
    kind: inner.kind,
    supportsGlossary: inner.supportsGlossary,
    async translateBatch(request) {
      const batch = guardBatch(guard, request.entries);
      if (batch.entries.length === 0) {
        return recorded({ values: new Map(), integrity: new Map(), notices: [] }, batch.withheld);
      }
      const result = await inner.translateBatch(guardedRequest(guard, request, batch.entries));
      return restoreResult(result, batch, request);
    },
  };
}
