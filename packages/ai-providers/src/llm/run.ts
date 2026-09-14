import type { TranslationEntry } from "@verbatra/core";
import { checkBatchIntegrity } from "../integrity.js";
import {
  type ProviderNotice,
  type TranslateRequest,
  type TranslateResult,
  type Usage,
  type ValidatedRequestData,
  validateRequest,
} from "../provider.js";
import { applyProviderDegraded, buildEntryReviewFlags } from "../review-flags.js";
import { toIntegrityInputs } from "./integrity-inputs.js";
import { buildDataPayload } from "./payload.js";
import { type ReconcileOutcome, reconcileResult } from "./response.js";

const MAX_REPAIR_ROUNDS = 1;

export interface LlmCompletion {
  readonly raw: unknown;
  readonly usage?: Usage;
}

export interface LlmCompletionInput {
  readonly payloadJson: string;
  readonly requestedKeys: readonly string[];
  readonly signal?: AbortSignal;
}

export interface LlmMechanism {
  translate(input: LlmCompletionInput): Promise<LlmCompletion>;
}

export async function runLlmTranslation(
  request: TranslateRequest,
  mechanism: LlmMechanism,
): Promise<TranslateResult> {
  const data = validateRequest(request);
  const signal = request.signal;

  const first = await requestTranslations(mechanism, data, signal);
  const values = first.outcome.accepted;
  let usage = first.completion.usage;

  let toRepair = entriesFor(data.entries, first.outcome.missingKeys);
  for (let round = 0; round < MAX_REPAIR_ROUNDS && toRepair.length > 0; round += 1) {
    const repair = await requestTranslations(mechanism, { ...data, entries: toRepair }, signal);
    for (const [key, value] of repair.outcome.accepted) {
      values.set(key, value);
    }
    usage = mergeUsage(usage, repair.completion.usage);
    toRepair = entriesFor(data.entries, repair.outcome.missingKeys);
  }

  const integrity = checkBatchIntegrity(
    toIntegrityInputs(data.entries, values),
    request.extractPlaceholders,
    request.comparePlaceholders,
  );
  const notices: readonly ProviderNotice[] = [];
  const reviewFlags = applyProviderDegraded(
    buildEntryReviewFlags(
      data.entries,
      values,
      integrity,
      data.sourceLocale,
      data.targetLocale,
      data.glossary,
      data.maxLength,
    ),
    notices,
    [...values.keys()],
  );
  return usage === undefined
    ? { values, integrity, notices, reviewFlags }
    : { values, integrity, usage, notices, reviewFlags };
}

async function requestTranslations(
  mechanism: LlmMechanism,
  data: ValidatedRequestData,
  signal: AbortSignal | undefined,
): Promise<{ readonly completion: LlmCompletion; readonly outcome: ReconcileOutcome }> {
  const payloadJson = JSON.stringify(buildDataPayload(data));
  const requestedKeys = data.entries.map((entry) => entry.key);
  const completion = await mechanism.translate({
    payloadJson,
    requestedKeys,
    ...(signal !== undefined ? { signal } : {}),
  });
  return { completion, outcome: reconcileResult(completion.raw, requestedKeys) };
}

function entriesFor(
  entries: readonly TranslationEntry[],
  keys: readonly string[],
): TranslationEntry[] {
  const wanted = new Set(keys);
  return entries.filter((entry) => wanted.has(entry.key));
}

function mergeUsage(first: Usage | undefined, second: Usage | undefined): Usage | undefined {
  if (first === undefined) {
    return second;
  }
  if (second === undefined) {
    return first;
  }
  return {
    inputTokens: first.inputTokens + second.inputTokens,
    outputTokens: first.outputTokens + second.outputTokens,
  };
}
