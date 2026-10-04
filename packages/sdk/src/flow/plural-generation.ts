import type {
  LocaleGlossary,
  Tone,
  TranslateResult,
  TranslationProvider,
} from "@verbatra/ai-providers";
import {
  contentHash,
  type LocaleResource,
  type PluralCategory,
  type TranslationEntry,
} from "@verbatra/core";
import type { FormatAdapter } from "@verbatra/format-adapters";
import { sensitiveWithheldOf } from "../sensitive/guarded-provider.js";
import type { SensitiveFindingSource } from "../sensitive/scan-text.js";
import { chunk, subBatchFailedNotice } from "./batching.js";
import { type BudgetTracker, checkBudgetTrip, reconcileBudget, reserveBudget } from "./budget.js";
import { isCancelled, signalField } from "./cancellation.js";
import { payloadContextOf } from "./estimate.js";
import { gateCandidateValue, refusalOf } from "./integrity-gate.js";
import { readNotices } from "./notices.js";
import {
  type PluralGenerationItem,
  planPluralGeneration,
  syntheticEntry,
} from "./plural-categories.js";
import type { IntegrityRefusal, LocaleNotice, UsageSummary } from "./summary.js";
import { buildTranslateRequest } from "./translate-request.js";
import { createUsageAccumulator, foldUsage } from "./usage.js";

export interface PluralGenerationContext {
  readonly source: LocaleResource;
  readonly sourceLocale: string;
  readonly targetLocale: string;
  readonly format: string;
  readonly adapter: FormatAdapter;
  readonly provider: TranslationProvider;
  readonly glossary: LocaleGlossary | undefined;
  readonly maxLength: ReadonlyMap<string, number> | undefined;
  readonly tone: Tone | undefined;
  readonly baseline: ReadonlyMap<string, string>;
  readonly targetKeys: ReadonlySet<string>;
  readonly skip?: ReadonlySet<string>;
  readonly maxBatchSize: number;
  readonly budget: BudgetTracker;
  readonly signal?: AbortSignal;
}

export interface GeneratedForm {
  readonly targetKey: string;
  readonly entry: TranslationEntry;
  readonly lockHash: string;
}

export interface PluralGenerationResult {
  readonly accepted: readonly GeneratedForm[];
  readonly withheld: readonly string[];
  readonly refusals: readonly IntegrityRefusal[];
  readonly providerFailures: readonly string[];
  readonly budgetWithheld: readonly string[];
  readonly cancelled: readonly string[];
  readonly sensitiveWithheld: readonly string[];
  readonly sensitiveSources: readonly SensitiveFindingSource[];
  readonly notices: readonly LocaleNotice[];
  readonly usage: UsageSummary | undefined;
  readonly withheldByBudget: boolean;
  readonly refusedProjection: number | undefined;
  readonly counted: boolean;
}

const EMPTY_RESULT: PluralGenerationResult = {
  accepted: [],
  withheld: [],
  refusals: [],
  providerFailures: [],
  budgetWithheld: [],
  cancelled: [],
  sensitiveWithheld: [],
  sensitiveSources: [],
  notices: [],
  usage: undefined,
  withheldByBudget: false,
  refusedProjection: undefined,
  counted: false,
};

function generatedLockHash(
  governingEntries: readonly TranslationEntry[],
  category: PluralCategory,
): string {
  const governingHashes = governingEntries.map(contentHash).sort();
  return contentHash({
    key: "",
    namespace: "",
    value: `${category}:${governingHashes.join("|")}`,
    placeholders: [],
    isPlural: true,
  });
}

function isAdopted(
  item: PluralGenerationItem,
  targetKeys: ReadonlySet<string>,
  baseline: ReadonlyMap<string, string>,
): boolean {
  return targetKeys.has(item.targetKey) && !baseline.has(item.targetKey);
}

function staleItems(
  items: readonly PluralGenerationItem[],
  baseline: ReadonlyMap<string, string>,
): PluralGenerationItem[] {
  return items.filter((item) => {
    const hash = generatedLockHash(item.governingEntries, item.category);
    return baseline.get(item.targetKey) !== hash;
  });
}

export interface PendingPluralInput {
  readonly source: LocaleResource;
  readonly targetLocale: string;
  readonly format: string;
  readonly baseline: ReadonlyMap<string, string>;
  readonly targetKeys: ReadonlySet<string>;
  readonly skip?: ReadonlySet<string>;
}

export function pendingPluralForms(input: PendingPluralInput): readonly PluralGenerationItem[] {
  const plan = planPluralGeneration(input.source, input.targetLocale, input.format);
  const candidates = plan.items.filter(
    (item) =>
      !isAdopted(item, input.targetKeys, input.baseline) &&
      input.skip?.has(item.targetKey) !== true,
  );
  return staleItems(candidates, input.baseline);
}

export async function generatePluralForms(
  context: PluralGenerationContext,
): Promise<PluralGenerationResult> {
  const stale = pendingPluralForms(context);
  if (stale.length === 0) {
    return EMPTY_RESULT;
  }

  const accepted: GeneratedForm[] = [];
  const withheld: IntegrityRefusal[] = [];
  const providerFailures: string[] = [];
  const budgetWithheld: string[] = [];
  const cancelled: string[] = [];
  const sensitive: GenerationSensitive = { withheld: [], sources: new Set() };
  const notices: LocaleNotice[] = [];
  const usage = createUsageAccumulator();
  let budgetWithheldAny = false;
  let refusedProjection: number | undefined;
  let counted = false;
  const payload = payloadContextOf(context);
  for (const batch of chunk(stale, context.maxBatchSize)) {
    if (isCancelled(context.signal)) {
      cancelled.push(...batch.map((item) => item.targetKey));
      continue;
    }
    const entries = batch.map(syntheticEntry);
    const decision = reserveBudget(context.budget, entries, payload);
    if (decision.reservation === undefined) {
      for (const item of batch) {
        budgetWithheld.push(item.targetKey);
      }
      budgetWithheldAny = true;
      refusedProjection = refusedProjection ?? decision.refusedProjection;
      continue;
    }
    const subResult = await runGenerationSubBatch(context, batch, entries, {
      accepted,
      withheld,
      providerFailures,
      cancelled,
      sensitive,
    });
    notices.push(...subResult.notices);
    foldUsage(usage, subResult.usage);
    reconcileBudget(context.budget, decision.reservation, subResult.usage);
    if (checkBudgetTrip(context.budget)) {
      counted = true;
    }
  }
  return {
    accepted,
    withheld: withheld.map((refusal) => refusal.key),
    refusals: withheld,
    providerFailures,
    budgetWithheld,
    cancelled,
    sensitiveWithheld: sensitive.withheld,
    sensitiveSources: [...sensitive.sources].sort(),
    notices,
    usage: usage.total,
    withheldByBudget: budgetWithheldAny,
    refusedProjection,
    counted,
  };
}

interface GenerationSubBatchResult {
  readonly notices: readonly LocaleNotice[];
  readonly usage: TranslateResult["usage"];
}

interface GenerationSensitive {
  readonly withheld: string[];
  readonly sources: Set<SensitiveFindingSource>;
}

interface GenerationBuckets {
  readonly accepted: GeneratedForm[];
  readonly withheld: IntegrityRefusal[];
  readonly providerFailures: string[];
  readonly cancelled: string[];
  readonly sensitive: GenerationSensitive;
}

async function runGenerationSubBatch(
  context: PluralGenerationContext,
  batch: readonly PluralGenerationItem[],
  entries: readonly TranslationEntry[],
  buckets: GenerationBuckets,
): Promise<GenerationSubBatchResult> {
  let result: TranslateResult;
  try {
    result = await context.provider.translateBatch({
      ...buildTranslateRequest(context, entries),
      ...signalField(context.signal),
    });
  } catch (error) {
    if (isCancelled(context.signal)) {
      buckets.cancelled.push(...batch.map((item) => item.targetKey));
      return { notices: [], usage: undefined };
    }
    for (const item of batch) {
      buckets.providerFailures.push(item.targetKey);
    }
    return { notices: [subBatchFailedNotice(batch.length, error)], usage: undefined };
  }
  for (const item of batch) {
    foldGenerationItem(item, result, context, buckets);
  }
  return { notices: readNotices(result), usage: result.usage };
}

function foldMissingItem(
  item: PluralGenerationItem,
  result: TranslateResult,
  buckets: GenerationBuckets,
): void {
  const sources = sensitiveWithheldOf(result).get(item.targetKey);
  if (sources === undefined) {
    buckets.providerFailures.push(item.targetKey);
    return;
  }
  buckets.sensitive.withheld.push(item.targetKey);
  for (const source of sources) {
    buckets.sensitive.sources.add(source);
  }
}

function foldGenerationItem(
  item: PluralGenerationItem,
  result: TranslateResult,
  context: PluralGenerationContext,
  buckets: GenerationBuckets,
): void {
  const value = result.values.get(item.targetKey);
  if (value === undefined) {
    foldMissingItem(item, result, buckets);
    return;
  }
  const gate = gateCandidateValue(item.sourceEntry, value, context.adapter, context.targetLocale);
  if (gate.accepted) {
    buckets.accepted.push({
      targetKey: item.targetKey,
      entry: { ...syntheticEntry(item), value },
      lockHash: generatedLockHash(item.governingEntries, item.category),
    });
  } else {
    buckets.withheld.push(refusalOf(item.targetKey, gate));
  }
}
