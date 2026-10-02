import type {
  ReviewFlag,
  TranslateRequest,
  TranslateResult,
  TranslationProvider,
} from "@verbatra/ai-providers";
import type { PlaceholderIntegrityResult, TranslationEntry } from "@verbatra/core";
import type { SensitiveGuard } from "./guard.js";
import { restoreTokens } from "./tokens.js";

interface GuardedBatch {
  readonly entries: readonly TranslationEntry[];
  readonly originals: ReadonlyMap<string, readonly string[]>;
}

function guardBatch(guard: SensitiveGuard, entries: readonly TranslationEntry[]): GuardedBatch {
  const sent: TranslationEntry[] = [];
  const originals = new Map<string, readonly string[]>();
  for (const entry of entries) {
    const verdict = guard.entry(entry);
    if (verdict.action === "withhold") {
      continue;
    }
    if (verdict.action === "redact") {
      sent.push(verdict.entry);
      originals.set(entry.key, verdict.originals);
    } else {
      sent.push(entry);
    }
  }
  return { entries: sent, originals };
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

function restoreResult(
  result: TranslateResult,
  originals: ReadonlyMap<string, readonly string[]>,
): TranslateResult {
  const values = new Map<string, string>();
  for (const [key, value] of result.values) {
    const tokens = originals.get(key);
    const restored = tokens === undefined ? value : restoreTokens(value, tokens);
    if (restored !== undefined) {
      values.set(key, restored);
    }
  }
  const kept = new Set(values.keys());
  const integrity: Map<string, PlaceholderIntegrityResult> = keepKeys(result.integrity, kept);
  const reviewFlags: Map<string, ReviewFlag> = keepKeys(result.reviewFlags, kept);
  return { ...result, values, integrity, reviewFlags };
}

const NOTHING_SENT: TranslateResult = { values: new Map(), integrity: new Map(), notices: [] };

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
        return NOTHING_SENT;
      }
      const result = await inner.translateBatch(guardedRequest(guard, request, batch.entries));
      return restoreResult(result, batch.originals);
    },
  };
}
