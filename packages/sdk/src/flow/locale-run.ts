import {
  computeReviewFlags,
  ProviderError,
  type ProviderKind,
  type ReviewFlag,
  type Tone,
  type TranslateResult,
  type TranslationProvider,
} from "@verbatra/ai-providers";
import {
  contentHash,
  diffResources,
  type FormatId,
  type LocaleResource,
  type PlaceholderIntegrityResult,
  type TranslationEntry,
} from "@verbatra/core";
import type { FormatAdapter } from "@verbatra/format-adapters";
import { type FuzzyCacheMatch, findFuzzyMatch } from "../cache/fuzzy-lookup.js";
import { lookupMemory, lookupSource } from "../cache/translation-memory.js";
import type { CacheAddition, TranslationMemory } from "../cache/types.js";
import type { SdkFs } from "../fs.js";
import type { LocalePathResolver } from "../locale-path/resolver.js";
import { carrySourcelessLockEntry } from "../lock/carry-forward.js";
import type { ProgressListener } from "../progress/types.js";
import { chunk, subBatchFailedNotice } from "./batching.js";
import {
  type BudgetTracker,
  budgetAlreadyStoppedNotice,
  budgetExceededNotice,
  budgetWithheldNotice,
  checkBudgetTrip,
  reconcileBudget,
  reserveBudget,
} from "./budget.js";
import { type PayloadContext, payloadContextOf } from "./estimate.js";
import { gateCandidateValue } from "./integrity-gate.js";
import { deriveLocaleStatus } from "./locale-failure.js";
import { readNotices } from "./notices.js";
import {
  detectMissingPluralCategories,
  isGeneratedPluralKey,
  pluralIncompleteNotice,
  sourcePluralBaseKeys,
  targetPluralSetIncomplete,
} from "./plural-categories.js";
import {
  type GeneratedForm,
  generatePluralForms,
  type PluralGenerationResult,
  pendingPluralForms,
} from "./plural-generation.js";
import { readTargetResource } from "./read-target.js";
import type {
  FuzzyCacheHit,
  LocaleNotice,
  LocaleSummary,
  NeedsReviewEntry,
  UsageSummary,
} from "./summary.js";
import { buildTranslateRequest } from "./translate-request.js";
import { combineUsage, createUsageAccumulator, foldUsage } from "./usage.js";
import { writeTargetResource } from "./write-target.js";

export interface LocaleRunParams {
  readonly source: LocaleResource;
  readonly sourceInvalidIcuKeys: readonly string[];
  readonly baseline: ReadonlyMap<string, string>;
  readonly adapter: FormatAdapter;
  readonly provider: TranslationProvider | undefined;
  readonly providerKind: ProviderKind;
  readonly cwd: string;
  readonly resolver: LocalePathResolver;
  readonly sourceLocale: string;
  readonly targetLocale: string;
  readonly format: FormatId;
  readonly glossary: Readonly<Record<string, string>> | undefined;
  readonly maxLength: ReadonlyMap<string, number> | undefined;
  readonly tone: Tone | undefined;
  readonly prune: boolean;
  readonly generatePlurals: boolean;
  readonly maxBatchSize: number;
  readonly fs: SdkFs;
  readonly cache?: {
    readonly snapshot: TranslationMemory;
    readonly fingerprint: string;
    readonly fuzzy?: { readonly threshold: number };
  };
  readonly budget: BudgetTracker;
  readonly onProgress?: ProgressListener;
}

export interface LocaleRunResult {
  readonly summary: LocaleSummary;
  readonly lockEntries: Record<string, string>;
  readonly cacheAdditions: readonly CacheAddition[];
}

interface Accepted {
  readonly value: string;
  readonly source: TranslationEntry;
}

interface CachePartition {
  readonly hits: ReadonlyMap<string, Accepted>;
  readonly fuzzy: ReadonlyMap<string, FuzzyCacheHit>;
  readonly misses: readonly string[];
  readonly reviewFlags: ReadonlyMap<string, ReviewFlag>;
}

type RunCache = NonNullable<LocaleRunParams["cache"]>;

interface CacheHit {
  readonly value: string;
  readonly integrity: PlaceholderIntegrityResult;
  readonly match?: FuzzyCacheMatch;
}

function reviewCandidateValue(
  params: LocaleRunParams,
  source: TranslationEntry,
  candidate: string,
  integrity: PlaceholderIntegrityResult,
): ReviewFlag | undefined {
  return computeReviewFlags({
    sourceValue: source.value,
    translatedValue: candidate,
    sourceLocale: params.sourceLocale,
    targetLocale: params.targetLocale,
    integrity,
    glossary: params.glossary,
    maxLength: params.maxLength?.get(source.key),
  });
}

function reviewCachedValue(
  params: LocaleRunParams,
  source: TranslationEntry,
  hit: CacheHit,
): ReviewFlag | undefined {
  const computed = reviewCandidateValue(params, source, hit.value, hit.integrity);
  if (hit.match === undefined) {
    return computed;
  }
  return {
    status: "review",
    reasons: ["FUZZY_CACHE_REUSE", ...(computed?.reasons ?? [])],
  };
}

function acceptFuzzyFromCache(
  params: LocaleRunParams,
  cache: RunCache,
  source: TranslationEntry,
): CacheHit | undefined {
  const fuzzy = cache.fuzzy;
  if (fuzzy === undefined) {
    return undefined;
  }
  const match = findFuzzyMatch(
    cache.snapshot,
    cache.fingerprint,
    params.targetLocale,
    source.value,
    { threshold: fuzzy.threshold },
  );
  if (match === undefined) {
    return undefined;
  }
  const gate = gateCandidateValue(source, match.value, params.adapter);
  return gate.accepted ? { value: match.value, integrity: gate.integrity, match } : undefined;
}

function acceptFromCache(
  params: LocaleRunParams,
  cache: RunCache,
  source: TranslationEntry,
): CacheHit | undefined {
  const cached = lookupMemory(
    cache.snapshot,
    cache.fingerprint,
    params.targetLocale,
    contentHash(source),
  );
  if (cached === undefined) {
    return acceptFuzzyFromCache(params, cache, source);
  }
  const gate = gateCandidateValue(source, cached, params.adapter);
  return gate.accepted ? { value: cached, integrity: gate.integrity } : undefined;
}

function partitionCacheHits(
  params: LocaleRunParams,
  toTranslate: readonly string[],
): CachePartition {
  const cache = params.cache;
  const hits = new Map<string, Accepted>();
  const fuzzy = new Map<string, FuzzyCacheHit>();
  const reviewFlags = new Map<string, ReviewFlag>();
  if (cache === undefined) {
    return { hits, fuzzy, misses: toTranslate, reviewFlags };
  }
  const misses: string[] = [];
  for (const key of toTranslate) {
    const source = params.source.entries.get(key);
    /* v8 ignore next 3 -- candidates come from the source-driven diff, so a candidate key always has a source entry; this guard is purely defensive. */
    if (source === undefined) {
      continue;
    }
    const hit = acceptFromCache(params, cache, source);
    if (hit === undefined) {
      misses.push(key);
      continue;
    }
    hits.set(key, { value: hit.value, source });
    if (hit.match !== undefined) {
      fuzzy.set(key, {
        key,
        previousSource: hit.match.previousSource,
        similarity: hit.match.similarity,
      });
    }
    const flag = reviewCachedValue(params, source, hit);
    if (flag !== undefined) {
      reviewFlags.set(key, flag);
    }
  }
  return { hits, fuzzy, misses, reviewFlags };
}

function collectCacheAdditions(
  params: LocaleRunParams,
  accepted: ReadonlyMap<string, Accepted>,
  cacheHitKeys: ReadonlySet<string>,
  fuzzyKeys: ReadonlySet<string>,
): CacheAddition[] {
  const cache = params.cache;
  if (cache === undefined) {
    return [];
  }
  const additions: CacheAddition[] = [];
  for (const [key, entry] of accepted) {
    if (fuzzyKeys.has(key)) {
      continue;
    }
    const hash = contentHash(entry.source);
    const known = cacheHitKeys.has(key) && lookupSource(cache.snapshot, hash) !== undefined;
    if (!known) {
      additions.push({ contentHash: hash, value: entry.value, source: entry.source.value });
    }
  }
  return additions;
}

interface MissGroup {
  readonly representative: string;
  readonly duplicates: readonly string[];
}

function groupMissesByContent(
  params: LocaleRunParams,
  misses: readonly string[],
): readonly MissGroup[] {
  const byHash = new Map<string, { representative: string; duplicates: string[] }>();
  for (const key of misses) {
    const source = params.source.entries.get(key);
    /* v8 ignore next 3 -- misses come from the source-driven diff, so every miss key has a source entry; this guard is purely defensive. */
    if (source === undefined) {
      continue;
    }
    const existing = byHash.get(contentHash(source));
    if (existing === undefined) {
      byHash.set(contentHash(source), { representative: key, duplicates: [] });
    } else {
      existing.duplicates.push(key);
    }
  }
  return [...byHash.values()];
}

const BATCH_LEVEL_REASON = "PROVIDER_DEGRADED" as const;

interface TranslationOutcome {
  readonly accepted: Map<string, Accepted>;
  readonly integrityMismatches: string[];
  readonly providerFailures: string[];
  readonly budgetWithheld: string[];
  readonly reviewFlags: Map<string, ReviewFlag>;
}

function fanOutContentDuplicates(
  params: LocaleRunParams,
  groups: readonly MissGroup[],
  outcome: TranslationOutcome,
): void {
  for (const group of groups) {
    if (group.duplicates.length > 0) {
      applyGroupOutcome(params, group, outcome);
    }
  }
}

function applyGroupOutcome(
  params: LocaleRunParams,
  group: MissGroup,
  outcome: TranslationOutcome,
): void {
  const acceptedRepresentative = outcome.accepted.get(group.representative);
  if (acceptedRepresentative !== undefined) {
    fanOutAccepted(params, group, acceptedRepresentative, outcome);
    return;
  }
  withheldBucketFor(group.representative, outcome).push(...group.duplicates);
}

function duplicateReviewFlag(
  params: LocaleRunParams,
  representativeFlag: ReviewFlag | undefined,
  source: TranslationEntry,
  value: string,
  integrity: PlaceholderIntegrityResult,
): ReviewFlag | undefined {
  const recomputed = reviewCandidateValue(params, source, value, integrity);
  if (representativeFlag?.reasons.includes(BATCH_LEVEL_REASON) !== true) {
    return recomputed;
  }
  return {
    status: "review",
    reasons: [...(recomputed?.reasons ?? []), BATCH_LEVEL_REASON],
  };
}

function fanOutAccepted(
  params: LocaleRunParams,
  group: MissGroup,
  acceptedRepresentative: Accepted,
  outcome: TranslationOutcome,
): void {
  const representativeFlag = outcome.reviewFlags.get(group.representative);
  for (const key of group.duplicates) {
    const source = params.source.entries.get(key);
    /* v8 ignore next 3 -- duplicates come from the same source-driven diff as their representative. */
    if (source === undefined) {
      continue;
    }
    const gate = gateCandidateValue(source, acceptedRepresentative.value, params.adapter);
    if (!gate.accepted) {
      outcome.integrityMismatches.push(key);
      continue;
    }
    outcome.accepted.set(key, { value: acceptedRepresentative.value, source });
    const flag = duplicateReviewFlag(
      params,
      representativeFlag,
      source,
      acceptedRepresentative.value,
      gate.integrity,
    );
    if (flag !== undefined) {
      outcome.reviewFlags.set(key, flag);
    }
  }
}

function withheldBucketFor(representative: string, outcome: TranslationOutcome): string[] {
  if (outcome.integrityMismatches.includes(representative)) {
    return outcome.integrityMismatches;
  }
  if (outcome.budgetWithheld.includes(representative)) {
    return outcome.budgetWithheld;
  }
  return outcome.providerFailures;
}

async function shouldWriteTarget(
  params: LocaleRunParams,
  path: string,
  changed: { readonly accepted: number; readonly pruned: number; readonly generated: number },
): Promise<boolean> {
  if (changed.accepted > 0 || changed.pruned > 0 || changed.generated > 0) {
    return true;
  }
  return !(await params.fs.fileExists(path));
}

export async function runLocale(params: LocaleRunParams): Promise<LocaleRunResult> {
  const target = await readTargetResource({
    resolver: params.resolver,
    format: params.format,
    locale: params.targetLocale,
    adapter: params.adapter,
    fs: params.fs,
  });
  const diff = diffResources(params.source, target, { baseline: params.baseline });

  const sourceBaseKeys = sourcePluralBaseKeys(params.source);
  const orphaned = params.generatePlurals
    ? diff.orphaned.filter((key) => !isGeneratedPluralKey(key, sourceBaseKeys))
    : diff.orphaned;

  const pruned: readonly string[] = params.prune ? orphaned : [];

  const invalidIcu = new Set(params.sourceInvalidIcuKeys);
  const candidates = [...diff.missing, ...diff.changed];
  const toTranslate = candidates.filter((key) => !invalidIcu.has(key));
  const invalidIcuSource = candidates.filter((key) => invalidIcu.has(key));

  const pluralNotice = detectMissingPluralCategories(
    params.source,
    params.targetLocale,
    params.format,
  );
  const sdkNotices: readonly LocaleNotice[] = pluralNotice ? [pluralNotice] : [];

  const provider = params.provider;
  if (provider === undefined) {
    const planned = plannedGenerationKeys(params, new Set(target.entries.keys()));
    const projected = [...target.entries.keys(), ...toTranslate, ...planned].filter(
      (key) => !pruned.includes(key),
    );
    return {
      summary: baseSummary({
        locale: params.targetLocale,
        unchanged: diff.unchanged,
        orphaned,
        invalidIcuSource,
        translated: toTranslate,
        cacheHits: [],
        fuzzyHits: [],
        generated: planned,
        integrityMismatches: [],
        providerFailures: [],
        budgetWithheld: [],
        pruned,
        notices: generationEnabled(params) ? pluralNoticeFor(params, projected) : sdkNotices,
      }),
      lockEntries: {},
      cacheAdditions: [],
    };
  }

  const partition = partitionCacheHits(params, toTranslate);
  const cacheHitKeys = new Set(partition.hits.keys());
  const fuzzyKeys = new Set(partition.fuzzy.keys());
  const missGroups = groupMissesByContent(params, partition.misses);
  const entries = missGroups
    .map((group) => params.source.entries.get(group.representative))
    .filter((entry): entry is TranslationEntry => entry !== undefined);

  const startedStopped = params.budget.stopped;
  const accepted = new Map<string, Accepted>(partition.hits);
  const integrityMismatches: string[] = [];
  const providerFailures: string[] = [];
  const budgetWithheld: string[] = [];
  const reviewFlags = new Map<string, ReviewFlag>(partition.reviewFlags);
  const translation = await translateAndCheck(
    provider,
    params,
    entries,
    accepted,
    integrityMismatches,
    providerFailures,
    budgetWithheld,
    reviewFlags,
  );
  fanOutContentDuplicates(params, missGroups, {
    accepted,
    integrityMismatches,
    providerFailures,
    budgetWithheld,
    reviewFlags,
  });

  const merged = new Map(target.entries);
  for (const key of pruned) {
    merged.delete(key);
  }
  for (const key of params.source.entries.keys()) {
    const hit = accepted.get(key);
    if (hit !== undefined) {
      merged.set(key, { ...hit.source, value: hit.value, namespace: target.namespace });
    }
  }

  const generation = await runGeneration(params, provider, new Set(target.entries.keys()));
  for (const form of generation.accepted) {
    merged.set(form.targetKey, { ...form.entry, namespace: target.namespace });
  }

  const path = params.resolver.pathFor(params.targetLocale);
  const writeNeeded = await shouldWriteTarget(params, path, {
    accepted: accepted.size,
    pruned: pruned.length,
    generated: generation.accepted.length,
  });
  if (writeNeeded) {
    await writeTargetResource(
      params.adapter,
      {
        locale: params.targetLocale,
        namespace: target.namespace,
        format: params.format,
        entries: merged,
      },
      path,
      params.cwd,
    );
  }

  const pluralNotices = params.generatePlurals
    ? pluralNoticeFor(params, merged.keys())
    : sdkNotices;
  const notices: readonly LocaleNotice[] = [
    ...pluralNotices,
    ...translation.notices,
    ...generation.notices,
    ...budgetLocaleNotices(params.budget, startedStopped, translation, generation),
  ];

  const withheld = new Set([
    ...integrityMismatches,
    ...providerFailures,
    ...invalidIcuSource,
    ...generation.withheld,
    ...generation.providerFailures,
    ...budgetWithheld,
    ...fuzzyKeys,
  ]);
  const localeUsage = combineUsage(translation.usage, generation.usage);
  return {
    summary: baseSummary({
      locale: params.targetLocale,
      unchanged: diff.unchanged,
      orphaned,
      invalidIcuSource,
      translated: [...accepted.keys()].filter((key) => !cacheHitKeys.has(key)),
      cacheHits: [...cacheHitKeys].filter((key) => !fuzzyKeys.has(key)).sort(),
      fuzzyHits: [...partition.fuzzy.values()].sort((left, right) =>
        left.key.localeCompare(right.key),
      ),
      generated: generation.accepted.map((form) => form.targetKey).sort(),
      integrityMismatches: [...integrityMismatches, ...generation.withheld].sort(),
      providerFailures: [...providerFailures, ...generation.providerFailures].sort(),
      budgetWithheld: [...budgetWithheld, ...generation.budgetWithheld].sort(),
      pruned,
      notices,
      needsReview: needsReviewFor(accepted.keys(), reviewFlags),
      ...(localeUsage !== undefined ? { usage: localeUsage } : {}),
    }),
    lockEntries: computeLockEntries(params, merged, withheld, generation.accepted),
    cacheAdditions: collectCacheAdditions(params, accepted, cacheHitKeys, fuzzyKeys),
  };
}

const NO_GENERATION_RESULT: PluralGenerationResult = {
  accepted: [],
  withheld: [],
  providerFailures: [],
  budgetWithheld: [],
  notices: [],
  usage: undefined,
  withheldByBudget: false,
  refusedProjection: undefined,
  counted: false,
};

function generationEnabled(params: LocaleRunParams): boolean {
  return params.generatePlurals && params.providerKind === "llm";
}

function plannedGenerationKeys(
  params: LocaleRunParams,
  targetKeys: ReadonlySet<string>,
): readonly string[] {
  if (!generationEnabled(params)) {
    return [];
  }
  return pendingPluralForms({
    source: params.source,
    targetLocale: params.targetLocale,
    format: params.format,
    baseline: params.baseline,
    targetKeys,
  })
    .map((item) => item.targetKey)
    .sort();
}

async function runGeneration(
  params: LocaleRunParams,
  provider: TranslationProvider,
  targetKeys: ReadonlySet<string>,
): Promise<PluralGenerationResult> {
  if (!generationEnabled(params)) {
    return NO_GENERATION_RESULT;
  }
  return generatePluralForms({
    source: params.source,
    sourceLocale: params.sourceLocale,
    targetLocale: params.targetLocale,
    format: params.format,
    adapter: params.adapter,
    provider,
    glossary: params.glossary,
    maxLength: params.maxLength,
    tone: params.tone,
    baseline: params.baseline,
    targetKeys,
    maxBatchSize: params.maxBatchSize,
    budget: params.budget,
  });
}

interface BudgetLocaleOutcome {
  readonly withheldByBudget: boolean;
  readonly refusedProjection: number | undefined;
  readonly counted: boolean;
}

function budgetLocaleNotices(
  budget: BudgetTracker,
  startedStopped: boolean,
  main: BudgetLocaleOutcome,
  generation: BudgetLocaleOutcome,
): readonly LocaleNotice[] {
  const refused = main.refusedProjection ?? generation.refusedProjection;
  if (refused !== undefined) {
    return [budgetWithheldNotice(budget, refused)];
  }
  if (main.counted || generation.counted) {
    return [budgetExceededNotice(budget)];
  }
  return startedStopped || main.withheldByBudget || generation.withheldByBudget
    ? [budgetAlreadyStoppedNotice(budget)]
    : [];
}

function pluralNoticeFor(params: LocaleRunParams, keys: Iterable<string>): readonly LocaleNotice[] {
  if (params.format !== "i18next-json") {
    return [];
  }
  if (!targetPluralSetIncomplete(keys, params.targetLocale)) {
    return [];
  }
  return [pluralIncompleteNotice(params.targetLocale)];
}

interface SummaryParts {
  readonly locale: string;
  readonly unchanged: readonly string[];
  readonly orphaned: readonly string[];
  readonly invalidIcuSource: readonly string[];
  readonly translated: readonly string[];
  readonly cacheHits: readonly string[];
  readonly fuzzyHits: readonly FuzzyCacheHit[];
  readonly generated: readonly string[];
  readonly integrityMismatches: readonly string[];
  readonly providerFailures: readonly string[];
  readonly budgetWithheld: readonly string[];
  readonly pruned: readonly string[];
  readonly notices: readonly LocaleNotice[];
  readonly usage?: UsageSummary;
  readonly needsReview?: readonly NeedsReviewEntry[];
}

function baseSummary(parts: SummaryParts): LocaleSummary {
  return {
    locale: parts.locale,
    status: deriveLocaleStatus(parts),
    translated: parts.translated,
    unchanged: parts.unchanged,
    orphaned: parts.orphaned,
    pruned: parts.pruned,
    invalidIcuSource: parts.invalidIcuSource,
    cacheHits: parts.cacheHits,
    fuzzyHits: parts.fuzzyHits,
    integrityMismatches: parts.integrityMismatches,
    providerFailures: parts.providerFailures,
    budgetWithheld: parts.budgetWithheld,
    generated: parts.generated,
    notices: parts.notices,
    needsReview: parts.needsReview ?? [],
    unfilled: [],
    malformedRows: [],
    duplicateKeys: [],
    ...(parts.usage !== undefined ? { usage: parts.usage } : {}),
  };
}

function needsReviewFor(
  acceptedKeys: Iterable<string>,
  reviewFlags: ReadonlyMap<string, ReviewFlag>,
): readonly NeedsReviewEntry[] {
  const entries: NeedsReviewEntry[] = [];
  for (const key of acceptedKeys) {
    const flag = reviewFlags.get(key);
    if (flag !== undefined) {
      entries.push({ key, reasons: flag.reasons });
    }
  }
  return entries.sort((a, b) => (a.key < b.key ? -1 : 1));
}

interface TranslateAndCheckResult {
  readonly notices: readonly LocaleNotice[];
  readonly withheldByBudget: boolean;
  readonly refusedProjection: number | undefined;
  readonly counted: boolean;
  readonly usage: UsageSummary | undefined;
}

async function translateAndCheck(
  provider: TranslationProvider,
  params: LocaleRunParams,
  entries: readonly TranslationEntry[],
  accepted: Map<string, Accepted>,
  integrityMismatches: string[],
  providerFailures: string[],
  budgetWithheld: string[],
  reviewFlags: Map<string, ReviewFlag>,
): Promise<TranslateAndCheckResult> {
  const notices: LocaleNotice[] = [];
  const usage = createUsageAccumulator();
  let withheld = false;
  let refusedProjection: number | undefined;
  let counted = false;
  const outcome: TranslationOutcome = {
    accepted,
    integrityMismatches,
    providerFailures,
    budgetWithheld,
    reviewFlags,
  };
  const batches = chunk(entries, params.maxBatchSize);
  const payload = payloadContextOf(params);
  let batchIndex = 0;
  for (const batch of batches) {
    batchIndex += 1;
    params.onProgress?.({
      type: "sub-batch",
      locale: params.targetLocale,
      batchIndex,
      totalBatches: batches.length,
    });
    const subResult = await runSubBatch(provider, params, payload, batch, outcome);
    notices.push(...subResult.notices);
    foldUsage(usage, subResult.usage);
    withheld = withheld || subResult.withheld;
    refusedProjection = refusedProjection ?? subResult.refusedProjection;
    counted = counted || subResult.counted;
  }
  return { notices, withheldByBudget: withheld, refusedProjection, counted, usage: usage.total };
}

function withholdBatch(batch: readonly TranslationEntry[], budgetWithheld: string[]): void {
  for (const entry of batch) {
    budgetWithheld.push(entry.key);
  }
}

interface SubBatchResult {
  readonly notices: readonly LocaleNotice[];
  readonly usage: TranslateResult["usage"];
  readonly withheld: boolean;
  readonly refusedProjection: number | undefined;
  readonly counted: boolean;
}

async function runSubBatch(
  provider: TranslationProvider,
  params: LocaleRunParams,
  payload: PayloadContext,
  batch: readonly TranslationEntry[],
  outcome: TranslationOutcome,
): Promise<SubBatchResult> {
  const decision = reserveBudget(params.budget, batch, payload);
  if (decision.reservation === undefined) {
    withholdBatch(batch, outcome.budgetWithheld);
    return {
      notices: [],
      usage: undefined,
      withheld: true,
      refusedProjection: decision.refusedProjection,
      counted: false,
    };
  }
  let result: TranslateResult;
  try {
    result = await provider.translateBatch(buildTranslateRequest(params, batch));
  } catch (error) {
    reconcileBudget(params.budget, decision.reservation, undefined);
    const tripped = checkBudgetTrip(params.budget);
    const failure = await handleSubBatchFailure(error, provider, params, payload, batch, outcome);
    return { ...failure, counted: tripped || failure.counted };
  }
  reconcileBudget(params.budget, decision.reservation, result.usage);
  const tripped = checkBudgetTrip(params.budget);
  for (const entry of batch) {
    foldEntryResult(
      entry,
      result,
      params.adapter,
      outcome.accepted,
      outcome.integrityMismatches,
      outcome.providerFailures,
    );
  }
  if (result.reviewFlags !== undefined) {
    for (const [key, flag] of result.reviewFlags) {
      outcome.reviewFlags.set(key, flag);
    }
  }
  return {
    notices: readNotices(result),
    usage: result.usage,
    withheld: false,
    refusedProjection: undefined,
    counted: tripped,
  };
}

function isOutputTruncated(error: unknown): boolean {
  return error instanceof ProviderError && error.code === "OUTPUT_TRUNCATED";
}

async function handleSubBatchFailure(
  error: unknown,
  provider: TranslationProvider,
  params: LocaleRunParams,
  payload: PayloadContext,
  batch: readonly TranslationEntry[],
  outcome: TranslationOutcome,
): Promise<SubBatchResult> {
  if (isOutputTruncated(error) && batch.length > 1) {
    return retryTruncatedSplit(provider, params, payload, batch, outcome);
  }
  for (const entry of batch) {
    outcome.providerFailures.push(entry.key);
  }
  return {
    notices: [subBatchFailedNotice(batch.length, error)],
    usage: undefined,
    withheld: false,
    refusedProjection: undefined,
    counted: false,
  };
}

async function retryTruncatedSplit(
  provider: TranslationProvider,
  params: LocaleRunParams,
  payload: PayloadContext,
  batch: readonly TranslationEntry[],
  outcome: TranslationOutcome,
): Promise<SubBatchResult> {
  const notices: LocaleNotice[] = [];
  let usage: TranslateResult["usage"];
  let withheld = false;
  let refusedProjection: number | undefined;
  let counted = false;
  for (const half of chunk(batch, Math.ceil(batch.length / 2))) {
    const sub = await runSubBatch(provider, params, payload, half, outcome);
    notices.push(...sub.notices);
    usage = combineUsage(usage, sub.usage);
    withheld = withheld || sub.withheld;
    refusedProjection = refusedProjection ?? sub.refusedProjection;
    counted = counted || sub.counted;
  }
  return { notices, usage, withheld, refusedProjection, counted };
}

function foldEntryResult(
  entry: TranslationEntry,
  result: TranslateResult,
  adapter: FormatAdapter,
  accepted: Map<string, Accepted>,
  integrityMismatches: string[],
  providerFailures: string[],
): void {
  const value = result.values.get(entry.key);
  if (value === undefined) {
    providerFailures.push(entry.key);
    return;
  }
  if (gateCandidateValue(entry, value, adapter).accepted) {
    accepted.set(entry.key, { value, source: entry });
  } else {
    integrityMismatches.push(entry.key);
  }
}

function computeLockEntries(
  params: LocaleRunParams,
  merged: ReadonlyMap<string, TranslationEntry>,
  withheld: ReadonlySet<string>,
  generated: readonly GeneratedForm[],
): Record<string, string> {
  const lockEntries = new Map<string, string>();
  for (const key of merged.keys()) {
    const sourceEntry = params.source.entries.get(key);
    if (sourceEntry === undefined) {
      carrySourcelessLockEntry(lockEntries, params.baseline, key);
      continue;
    }
    if (withheld.has(key)) {
      const prior = params.baseline.get(key);
      if (prior !== undefined) {
        lockEntries.set(key, prior);
      }
      continue;
    }
    lockEntries.set(key, contentHash(sourceEntry));
  }
  for (const form of generated) {
    lockEntries.set(form.targetKey, form.lockHash);
  }
  return Object.fromEntries(lockEntries);
}
