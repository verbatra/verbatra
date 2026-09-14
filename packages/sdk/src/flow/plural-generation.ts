import type { Tone, TranslateResult, TranslationProvider } from "@verbatra/ai-providers";
import { contentHash, type LocaleResource, type TranslationEntry } from "@verbatra/core";
import type { FormatAdapter } from "@verbatra/format-adapters";
import { chunk, subBatchFailedNotice } from "./batching.js";
import { type BudgetTracker, checkBudgetTrip, foldTrackerUsage } from "./budget.js";
import { gateCandidateValue } from "./integrity-gate.js";
import { readNotices } from "./notices.js";
import {
  type CldrPluralCategory,
  type PluralGenerationItem,
  planPluralGeneration,
  syntheticEntry,
} from "./plural-categories.js";
import type { LocaleNotice, UsageSummary } from "./summary.js";
import { buildTranslateRequest } from "./translate-request.js";
import { createUsageAccumulator, foldUsage } from "./usage.js";

export interface PluralGenerationContext {
  readonly source: LocaleResource;
  readonly sourceLocale: string;
  readonly targetLocale: string;
  readonly format: string;
  readonly adapter: FormatAdapter;
  readonly provider: TranslationProvider;
  readonly glossary: Readonly<Record<string, string>> | undefined;
  readonly tone: Tone | undefined;
  readonly baseline: ReadonlyMap<string, string>;
  readonly targetKeys: ReadonlySet<string>;
  readonly maxBatchSize: number;
  readonly budget: BudgetTracker;
}

export interface GeneratedForm {
  readonly targetKey: string;
  readonly entry: TranslationEntry;
  readonly lockHash: string;
}

export interface PluralGenerationResult {
  readonly accepted: readonly GeneratedForm[];
  readonly withheld: readonly string[];
  readonly providerFailures: readonly string[];
  readonly budgetWithheld: readonly string[];
  readonly notices: readonly LocaleNotice[];
  readonly usage: UsageSummary | undefined;
  readonly tripped: boolean;
}

const EMPTY_RESULT: PluralGenerationResult = {
  accepted: [],
  withheld: [],
  providerFailures: [],
  budgetWithheld: [],
  notices: [],
  usage: undefined,
  tripped: false,
};

function generatedLockHash(
  governingEntries: readonly TranslationEntry[],
  category: CldrPluralCategory,
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
}

export function pendingPluralForms(input: PendingPluralInput): readonly PluralGenerationItem[] {
  const plan = planPluralGeneration(input.source, input.targetLocale, input.format);
  const candidates = plan.items.filter(
    (item) => !isAdopted(item, input.targetKeys, input.baseline),
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
  const withheld: string[] = [];
  const providerFailures: string[] = [];
  const budgetWithheld: string[] = [];
  const notices: LocaleNotice[] = [];
  const usage = createUsageAccumulator();
  let tripped = false;
  for (const batch of chunk(stale, context.maxBatchSize)) {
    if (context.budget.stopped) {
      for (const item of batch) {
        budgetWithheld.push(item.targetKey);
      }
      continue;
    }
    const subResult = await runGenerationSubBatch(
      context,
      batch,
      accepted,
      withheld,
      providerFailures,
    );
    notices.push(...subResult.notices);
    foldUsage(usage, subResult.usage);
    foldTrackerUsage(context.budget, subResult.usage);
    if (checkBudgetTrip(context.budget)) {
      tripped = true;
    }
  }
  return {
    accepted,
    withheld,
    providerFailures,
    budgetWithheld,
    notices,
    usage: usage.total,
    tripped,
  };
}

interface GenerationSubBatchResult {
  readonly notices: readonly LocaleNotice[];
  readonly usage: TranslateResult["usage"];
}

async function runGenerationSubBatch(
  context: PluralGenerationContext,
  batch: readonly PluralGenerationItem[],
  accepted: GeneratedForm[],
  withheld: string[],
  providerFailures: string[],
): Promise<GenerationSubBatchResult> {
  let result: TranslateResult;
  try {
    const entries = batch.map(syntheticEntry);
    result = await context.provider.translateBatch(buildTranslateRequest(context, entries));
  } catch (error) {
    for (const item of batch) {
      providerFailures.push(item.targetKey);
    }
    return { notices: [subBatchFailedNotice(batch.length, error)], usage: undefined };
  }
  for (const item of batch) {
    foldGenerationItem(item, result, context.adapter, accepted, withheld, providerFailures);
  }
  return { notices: readNotices(result), usage: result.usage };
}

function foldGenerationItem(
  item: PluralGenerationItem,
  result: TranslateResult,
  adapter: FormatAdapter,
  accepted: GeneratedForm[],
  withheld: string[],
  providerFailures: string[],
): void {
  const value = result.values.get(item.targetKey);
  if (value === undefined) {
    providerFailures.push(item.targetKey);
    return;
  }
  if (gateCandidateValue(item.sourceEntry, value, adapter).accepted) {
    accepted.push({
      targetKey: item.targetKey,
      entry: { ...syntheticEntry(item), value },
      lockHash: generatedLockHash(item.governingEntries, item.category),
    });
  } else {
    withheld.push(item.targetKey);
  }
}
