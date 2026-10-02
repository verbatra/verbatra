import {
  computeReviewFlags,
  type LocaleGlossary,
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
import {
  type MachineAttribution,
  type PendingProvenance,
  type ProvenanceOrigin,
  type ProvenancePatch,
  settleProvenance,
} from "../lock/provenance-file.js";
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
import {
  sourceForeignPlaceholderNotice,
  withForeignPlaceholderReason,
} from "./foreign-placeholders.js";
import { gateCandidateValue, refusalOf } from "./integrity-gate.js";
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
import {
  isRejectedValue,
  type ProtectionPolicy,
  type ProvenanceView,
  protectedKeys,
  type RejectedValueHashes,
} from "./protection.js";
import { readTargetResource } from "./read-target.js";
import { inSourceOrder } from "./source-order.js";
import type {
  FuzzyCacheHit,
  IntegrityRefusal,
  LocaleNotice,
  LocaleSummary,
  NeedsReviewEntry,
  ProtectedKey,
  ProtectionReason,
  SuggestionStatus,
  UsageSummary,
} from "./summary.js";
import { buildTranslateRequest } from "./translate-request.js";
import { combineUsage, countableUsage, createUsageAccumulator, foldUsage } from "./usage.js";
import { writeTargetResource } from "./write-target.js";

export type LocaleRunMode =
  | { readonly kind: "plan"; readonly providerKind: ProviderKind }
  | { readonly kind: "memory-only"; readonly write: boolean }
  | {
      readonly kind: "translate";
      readonly provider: TranslationProvider;
      readonly providerKind: ProviderKind;
    };

export interface LocaleRunParams {
  readonly source: LocaleResource;
  readonly sourceInvalidIcuKeys: readonly string[];
  readonly baseline: ReadonlyMap<string, string>;
  readonly adapter: FormatAdapter;
  readonly mode: LocaleRunMode;
  readonly cwd: string;
  readonly resolver: LocalePathResolver;
  readonly sourceLocale: string;
  readonly targetLocale: string;
  readonly format: FormatId;
  readonly glossary: LocaleGlossary | undefined;
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
  readonly machine?: MachineAttribution;
  readonly protection?: {
    readonly policy: ProtectionPolicy;
    readonly provenance: ProvenanceView;
  };
  readonly rejected?: RejectedValueHashes;
  readonly onProgress?: ProgressListener;
}

export interface LocaleRunResult {
  readonly summary: LocaleSummary;
  readonly lockEntries: Record<string, string>;
  readonly provenance: ProvenancePatch;
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
  const flag = computeReviewFlags({
    sourceValue: source.value,
    translatedValue: candidate,
    sourceLocale: params.sourceLocale,
    targetLocale: params.targetLocale,
    integrity,
    glossary: params.glossary,
    maxLength: params.maxLength?.get(source.key),
  });
  return withForeignPlaceholderReason(flag, params.format, source.value, candidate);
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
    {
      threshold: fuzzy.threshold,
      excludeValue: (value) => isRejectedValue(params.rejected, source.key, value),
    },
  );
  if (match === undefined) {
    return undefined;
  }
  const gate = gateCandidateValue(source, match.value, params.adapter, params.targetLocale);
  return gate.accepted ? { value: match.value, integrity: gate.integrity, match } : undefined;
}

function acceptFromCache(
  params: LocaleRunParams,
  cache: RunCache,
  source: TranslationEntry,
  allowFuzzy: boolean,
): CacheHit | undefined {
  const cached = lookupMemory(
    cache.snapshot,
    cache.fingerprint,
    params.targetLocale,
    contentHash(source),
  );
  if (cached === undefined || isRejectedValue(params.rejected, source.key, cached)) {
    return allowFuzzy ? acceptFuzzyFromCache(params, cache, source) : undefined;
  }
  const gate = gateCandidateValue(source, cached, params.adapter, params.targetLocale);
  return gate.accepted ? { value: cached, integrity: gate.integrity } : undefined;
}

function cacheForMode(params: LocaleRunParams): RunCache | undefined {
  const cache = params.cache;
  if (cache === undefined || params.mode.kind !== "memory-only") {
    return cache;
  }
  return { snapshot: cache.snapshot, fingerprint: cache.fingerprint };
}

function partitionCacheHits(
  params: LocaleRunParams,
  toTranslate: readonly string[],
  exactOnly: ReadonlySet<string>,
): CachePartition {
  const cache = cacheForMode(params);
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
    const hit = acceptFromCache(params, cache, source, !exactOnly.has(key));
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
  readonly integrityRefusals: Map<string, IntegrityRefusal>;
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
  const refusal = outcome.integrityRefusals.get(group.representative);
  if (refusal !== undefined) {
    for (const key of group.duplicates) {
      outcome.integrityRefusals.set(key, { ...refusal, key });
    }
  }
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
    const gate = gateCandidateValue(
      source,
      acceptedRepresentative.value,
      params.adapter,
      params.targetLocale,
    );
    if (!gate.accepted) {
      outcome.integrityMismatches.push(key);
      outcome.integrityRefusals.set(key, refusalOf(key, gate));
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
  changed: {
    readonly accepted: number;
    readonly pruned: number;
    readonly generated: number;
    readonly withheld: number;
  },
): Promise<boolean> {
  if (params.mode.kind === "memory-only" && !params.mode.write) {
    return false;
  }
  if (changed.accepted > 0 || changed.pruned > 0 || changed.generated > 0) {
    return true;
  }
  if (changed.withheld > 0) {
    return false;
  }
  return !(await params.fs.fileExists(path));
}

function reportPlan(
  params: LocaleRunParams,
  provider: TranslationProvider | undefined,
  keys: number,
  cacheHits: number,
): void {
  if (provider === undefined || keys === 0) {
    return;
  }
  params.onProgress?.({
    type: "locale-planned",
    locale: params.targetLocale,
    keys,
    batches: Math.ceil(keys / params.maxBatchSize),
    cacheHits,
  });
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
  const stale = [...diff.missing, ...diff.changed];
  const protection = planProtection(params, target, stale, invalidIcu);
  const toTranslate = stale.filter((key) => !invalidIcu.has(key) && !protection.held.has(key));
  const invalidIcuSource = stale.filter((key) => invalidIcu.has(key));

  const pluralNotice = detectMissingPluralCategories(
    params.source,
    params.targetLocale,
    params.format,
  );
  const sdkNotices: readonly LocaleNotice[] = pluralNotice ? [pluralNotice] : [];
  const sourceNotices = sourceNoticesFor(params, toTranslate);

  if (params.mode.kind === "plan") {
    const planned = plannedGenerationKeys(
      params,
      new Set(target.entries.keys()),
      protection.heldForms,
    );
    const translated = toTranslate.filter((key) => !protection.suggest.has(key));
    const projected = [...target.entries.keys(), ...translated, ...planned].filter(
      (key) => !pruned.includes(key),
    );
    return {
      summary: baseSummary({
        locale: params.targetLocale,
        unchanged: diff.unchanged,
        orphaned,
        invalidIcuSource,
        translated,
        cacheHits: [],
        fuzzyHits: [],
        generated: planned,
        integrityMismatches: [],
        integrityRefusals: [],
        providerFailures: [],
        budgetWithheld: [],
        pruned,
        notices: [
          ...(generationEnabled(params) ? pluralNoticeFor(params, projected) : sdkNotices),
          ...sourceNotices,
        ],
        protected: protectedEntries(protection.reasons, plannedSuggestions(protection.suggest)),
      }),
      lockEntries: {},
      provenance: { records: new Map() },
      cacheAdditions: [],
    };
  }

  const partition = partitionCacheHits(params, toTranslate, protection.suggest);
  const cacheHitKeys = new Set(partition.hits.keys());
  const fuzzyKeys = new Set(partition.fuzzy.keys());
  const missGroups = groupMissesByContent(params, partition.misses);
  const entries = missGroups
    .map((group) => params.source.entries.get(group.representative))
    .filter((entry): entry is TranslationEntry => entry !== undefined);

  const startedStopped = params.budget.stopped;
  const accepted = new Map<string, Accepted>(partition.hits);
  const integrityMismatches: string[] = [];
  const integrityRefusals = new Map<string, IntegrityRefusal>();
  const providerFailures: string[] = [];
  const budgetWithheld: string[] = [];
  const reviewFlags = new Map<string, ReviewFlag>(partition.reviewFlags);
  const provider = params.mode.kind === "translate" ? params.mode.provider : undefined;
  reportPlan(params, provider, entries.length, partition.hits.size);
  const unfilled = unfilledKeys(params.mode, partition);
  const translation = await translateMisses(provider, params, missGroups, entries, {
    accepted,
    integrityMismatches,
    integrityRefusals,
    providerFailures,
    budgetWithheld,
    reviewFlags,
  });
  const cacheAdditions = collectCacheAdditions(params, accepted, cacheHitKeys, fuzzyKeys);
  const suggestions = divertSuggestions(protection.suggest, accepted, reviewFlags, {
    integrityMismatches,
    providerFailures,
    budgetWithheld,
  });

  const merged = new Map(target.entries);
  for (const key of pruned) {
    merged.delete(key);
  }
  for (const [key, hit] of inSourceOrder(params.source.entries.keys(), accepted)) {
    merged.set(key, { ...hit.source, value: hit.value, namespace: target.namespace });
  }

  const generation = await runGeneration(
    params,
    provider,
    new Set(target.entries.keys()),
    protection.heldForms,
  );
  for (const form of generation.accepted) {
    merged.set(form.targetKey, { ...form.entry, namespace: target.namespace });
  }

  const path = params.resolver.pathFor(params.targetLocale);
  const writeNeeded = await shouldWriteTarget(params, path, {
    accepted: accepted.size,
    pruned: pruned.length,
    generated: generation.accepted.length,
    withheld:
      integrityMismatches.length +
      providerFailures.length +
      budgetWithheld.length +
      generation.withheld.length +
      generation.providerFailures.length +
      generation.budgetWithheld.length +
      unfilled.length,
  });
  const pending = pendingProvenance(params, accepted, { cacheHitKeys, fuzzyKeys }, generation);
  let written: LocaleResource = { ...target, entries: merged };
  if (writeNeeded) {
    params.onProgress?.({ type: "writing", locale: params.targetLocale });
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
      { sourcePath: params.resolver.pathFor(params.sourceLocale) },
    );
    written = await readWrittenTarget(params, pending.size > 0, written);
  }

  const pluralNotices = params.generatePlurals
    ? pluralNoticeFor(params, merged.keys())
    : sdkNotices;
  const notices: readonly LocaleNotice[] = [
    ...pluralNotices,
    ...sourceNotices,
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
    ...unfilled,
    ...protection.reasons.keys(),
  ]);
  const localeUsage = combineUsage(translation.usage, generation.usage);
  return {
    summary: baseSummary({
      locale: params.targetLocale,
      unchanged: diff.unchanged,
      orphaned,
      invalidIcuSource,
      translated: [...accepted.keys()].filter((key) => !cacheHitKeys.has(key)),
      cacheHits: [...cacheHitKeys]
        .filter((key) => !fuzzyKeys.has(key) && !protection.suggest.has(key))
        .sort(),
      fuzzyHits: [...partition.fuzzy.values()].sort((left, right) =>
        left.key.localeCompare(right.key),
      ),
      generated: generation.accepted.map((form) => form.targetKey).sort(),
      integrityMismatches: [...integrityMismatches, ...generation.withheld].sort(),
      integrityRefusals: refusalsFor(integrityMismatches, integrityRefusals, generation.refusals),
      providerFailures: [...providerFailures, ...generation.providerFailures].sort(),
      budgetWithheld: [...budgetWithheld, ...generation.budgetWithheld].sort(),
      pruned,
      notices,
      unfilled,
      needsReview: needsReviewFor(accepted.keys(), reviewFlags),
      protected: protectedEntries(protection.reasons, suggestions),
      ...(localeUsage !== undefined ? { usage: localeUsage } : {}),
    }),
    lockEntries: computeLockEntries(params, merged, withheld, generation.accepted),
    provenance: settleProvenance(pending, written, new Set(merged.keys())),
    cacheAdditions,
  };
}

interface ProtectionPlan {
  readonly reasons: ReadonlyMap<string, ProtectionReason>;
  readonly held: ReadonlySet<string>;
  readonly suggest: ReadonlySet<string>;
  readonly heldForms: ReadonlySet<string>;
}

const NO_PROTECTION: ProtectionPlan = {
  reasons: new Map(),
  held: new Set(),
  suggest: new Set(),
  heldForms: new Set(),
};

function suggestsFor(params: LocaleRunParams, policy: ProtectionPolicy): boolean {
  return policy.humanEdits === "suggest" && params.mode.kind !== "memory-only";
}

function planProtection(
  params: LocaleRunParams,
  target: LocaleResource,
  candidates: readonly string[],
  invalidIcu: ReadonlySet<string>,
): ProtectionPlan {
  const protection = params.protection;
  if (protection === undefined) {
    return NO_PROTECTION;
  }
  const { policy, provenance } = protection;
  const reasons = protectedKeys(policy, provenance, target, candidates);
  const suggesting = suggestsFor(params, policy);
  const suggest = new Set<string>();
  const held = new Set<string>();
  for (const [key, reason] of reasons) {
    if (suggesting && reason !== "pinned" && !invalidIcu.has(key)) {
      suggest.add(key);
    } else {
      held.add(key);
    }
  }
  const forms = protectedForms(params, protection, target, reasons);
  for (const [key, reason] of forms) {
    reasons.set(key, reason);
  }
  return { reasons, held, suggest, heldForms: new Set(forms.keys()) };
}

function protectedForms(
  params: LocaleRunParams,
  protection: NonNullable<LocaleRunParams["protection"]>,
  target: LocaleResource,
  baseReasons: ReadonlyMap<string, ProtectionReason>,
): Map<string, ProtectionReason> {
  const items = pendingFormItems(params, target);
  const forms = protectedKeys(
    protection.policy,
    protection.provenance,
    target,
    items.map((item) => item.targetKey),
  );
  for (const item of items) {
    const governing = item.governingEntries.find((entry) => baseReasons.has(entry.key));
    const reason = governing === undefined ? undefined : baseReasons.get(governing.key);
    if (reason !== undefined && !forms.has(item.targetKey)) {
      forms.set(item.targetKey, reason);
    }
  }
  return forms;
}

function pendingFormItems(
  params: LocaleRunParams,
  target: LocaleResource,
): ReturnType<typeof pendingPluralForms> {
  if (!generationEnabled(params)) {
    return [];
  }
  return pendingPluralForms({
    source: params.source,
    targetLocale: params.targetLocale,
    format: params.format,
    baseline: params.baseline,
    targetKeys: new Set(target.entries.keys()),
  });
}

function dropKeys(list: string[], keys: ReadonlySet<string>): void {
  const kept = list.filter((key) => !keys.has(key));
  list.length = 0;
  for (const key of kept) {
    list.push(key);
  }
}

interface SuggestionFailures {
  readonly integrityMismatches: string[];
  readonly providerFailures: string[];
  readonly budgetWithheld: string[];
}

interface SuggestionResult {
  readonly status: SuggestionStatus;
  readonly value?: string;
}

function suggestionFailure(key: string, failures: SuggestionFailures): SuggestionStatus {
  if (failures.integrityMismatches.includes(key)) {
    return "integrity-mismatch";
  }
  return failures.budgetWithheld.includes(key) ? "budget-withheld" : "provider-failure";
}

function plannedSuggestions(suggest: ReadonlySet<string>): ReadonlyMap<string, SuggestionResult> {
  return new Map([...suggest].map((key) => [key, { status: "planned" }]));
}

function divertSuggestions(
  suggest: ReadonlySet<string>,
  accepted: Map<string, Accepted>,
  reviewFlags: Map<string, ReviewFlag>,
  failures: SuggestionFailures,
): ReadonlyMap<string, SuggestionResult> {
  const suggestions = new Map<string, SuggestionResult>();
  if (suggest.size === 0) {
    return suggestions;
  }
  for (const key of suggest) {
    const hit = accepted.get(key);
    suggestions.set(
      key,
      hit === undefined
        ? { status: suggestionFailure(key, failures) }
        : { status: "suggested", value: hit.value },
    );
    accepted.delete(key);
    reviewFlags.delete(key);
  }
  dropKeys(failures.integrityMismatches, suggest);
  dropKeys(failures.providerFailures, suggest);
  dropKeys(failures.budgetWithheld, suggest);
  return suggestions;
}

function protectedEntry(
  key: string,
  reason: ProtectionReason,
  suggestion: SuggestionResult | undefined,
): ProtectedKey {
  if (suggestion === undefined) {
    return { key, reason };
  }
  return suggestion.value === undefined
    ? { key, reason, suggestionStatus: suggestion.status }
    : { key, reason, suggestion: suggestion.value, suggestionStatus: suggestion.status };
}

function protectedEntries(
  reasons: ReadonlyMap<string, ProtectionReason>,
  suggestions: ReadonlyMap<string, SuggestionResult>,
): readonly ProtectedKey[] {
  const entries: ProtectedKey[] = [];
  for (const [key, reason] of reasons) {
    entries.push(protectedEntry(key, reason, suggestions.get(key)));
  }
  return entries.sort((a, b) => (a.key < b.key ? -1 : 1));
}

const NO_GENERATION_RESULT: PluralGenerationResult = {
  accepted: [],
  withheld: [],
  refusals: [],
  providerFailures: [],
  budgetWithheld: [],
  notices: [],
  usage: undefined,
  withheldByBudget: false,
  refusedProjection: undefined,
  counted: false,
};

function generationEnabled(params: LocaleRunParams): boolean {
  return (
    params.generatePlurals &&
    params.mode.kind !== "memory-only" &&
    params.mode.providerKind === "llm"
  );
}

function plannedGenerationKeys(
  params: LocaleRunParams,
  targetKeys: ReadonlySet<string>,
  skip: ReadonlySet<string>,
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
    skip,
  })
    .map((item) => item.targetKey)
    .sort();
}

async function runGeneration(
  params: LocaleRunParams,
  provider: TranslationProvider | undefined,
  targetKeys: ReadonlySet<string>,
  skip: ReadonlySet<string>,
): Promise<PluralGenerationResult> {
  if (provider === undefined || !generationEnabled(params)) {
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
    skip,
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

function sourceNoticesFor(
  params: LocaleRunParams,
  pendingKeys: readonly string[],
): readonly LocaleNotice[] {
  const notice = sourceForeignPlaceholderNotice(params.format, params.source, pendingKeys);
  return notice === undefined ? [] : [notice];
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
  readonly integrityRefusals: readonly IntegrityRefusal[];
  readonly providerFailures: readonly string[];
  readonly budgetWithheld: readonly string[];
  readonly pruned: readonly string[];
  readonly notices: readonly LocaleNotice[];
  readonly usage?: UsageSummary;
  readonly needsReview?: readonly NeedsReviewEntry[];
  readonly unfilled?: readonly string[];
  readonly protected: readonly ProtectedKey[];
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
    integrityRefusals: parts.integrityRefusals,
    providerFailures: parts.providerFailures,
    budgetWithheld: parts.budgetWithheld,
    generated: parts.generated,
    notices: parts.notices,
    needsReview: parts.needsReview ?? [],
    unfilled: parts.unfilled ?? [],
    protected: parts.protected,
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

const NO_TRANSLATION: TranslateAndCheckResult = {
  notices: [],
  withheldByBudget: false,
  refusedProjection: undefined,
  counted: false,
  usage: undefined,
};

function unfilledKeys(mode: LocaleRunMode, partition: CachePartition): readonly string[] {
  return mode.kind === "memory-only" ? [...partition.misses].sort() : [];
}

async function translateMisses(
  provider: TranslationProvider | undefined,
  params: LocaleRunParams,
  missGroups: readonly MissGroup[],
  entries: readonly TranslationEntry[],
  outcome: TranslationOutcome,
): Promise<TranslateAndCheckResult> {
  if (provider === undefined) {
    return NO_TRANSLATION;
  }
  const translation = await translateAndCheck(provider, params, entries, outcome);
  fanOutContentDuplicates(params, missGroups, outcome);
  return translation;
}

async function translateAndCheck(
  provider: TranslationProvider,
  params: LocaleRunParams,
  entries: readonly TranslationEntry[],
  outcome: TranslationOutcome,
): Promise<TranslateAndCheckResult> {
  const notices: LocaleNotice[] = [];
  const usage = createUsageAccumulator();
  let withheld = false;
  let refusedProjection: number | undefined;
  let counted = false;
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
    const startedAt = Date.now();
    const subResult = await runSubBatch(provider, params, payload, batch, outcome);
    params.onProgress?.({
      type: "batch-finished",
      locale: params.targetLocale,
      batchIndex,
      totalBatches: batches.length,
      durationMs: Date.now() - startedAt,
      ...(subResult.usage !== undefined ? { usage: subResult.usage } : {}),
    });
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
  readonly usage: UsageSummary | undefined;
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
    result = await provider.translateBatch({
      ...buildTranslateRequest(params, batch),
      ...repairListener(params),
    });
  } catch (error) {
    reconcileBudget(params.budget, decision.reservation, undefined);
    const tripped = checkBudgetTrip(params.budget);
    const failure = await handleSubBatchFailure(error, provider, params, payload, batch, outcome);
    return { ...failure, counted: tripped || failure.counted };
  }
  reconcileBudget(params.budget, decision.reservation, result.usage);
  const tripped = checkBudgetTrip(params.budget);
  for (const entry of batch) {
    foldEntryResult(entry, result, params, outcome);
  }
  if (result.reviewFlags !== undefined) {
    for (const [key, flag] of result.reviewFlags) {
      outcome.reviewFlags.set(key, flag);
    }
  }
  flagForeignPlaceholders(params, batch, outcome);
  return {
    notices: readNotices(result),
    usage: result.usage === undefined ? undefined : countableUsage(result.usage),
    withheld: false,
    refusedProjection: undefined,
    counted: tripped,
  };
}

function repairListener(params: LocaleRunParams): { onRepair?: (keys: number) => void } {
  const onProgress = params.onProgress;
  return onProgress === undefined
    ? {}
    : { onRepair: (keys) => onProgress({ type: "repair", locale: params.targetLocale, keys }) };
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
    params.onProgress?.({ type: "split-retry", locale: params.targetLocale, keys: batch.length });
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
  let usage: UsageSummary | undefined;
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

function flagForeignPlaceholders(
  params: LocaleRunParams,
  batch: readonly TranslationEntry[],
  outcome: TranslationOutcome,
): void {
  for (const entry of batch) {
    const accepted = outcome.accepted.get(entry.key);
    if (accepted === undefined) {
      continue;
    }
    const flag = withForeignPlaceholderReason(
      outcome.reviewFlags.get(entry.key),
      params.format,
      entry.value,
      accepted.value,
    );
    if (flag !== undefined) {
      outcome.reviewFlags.set(entry.key, flag);
    }
  }
}

function foldEntryResult(
  entry: TranslationEntry,
  result: TranslateResult,
  params: LocaleRunParams,
  outcome: TranslationOutcome,
): void {
  const value = result.values.get(entry.key);
  if (value === undefined) {
    outcome.providerFailures.push(entry.key);
    return;
  }
  const gate = gateCandidateValue(entry, value, params.adapter, params.targetLocale);
  if (gate.accepted) {
    outcome.accepted.set(entry.key, { value, source: entry });
  } else {
    outcome.integrityMismatches.push(entry.key);
    outcome.integrityRefusals.set(entry.key, refusalOf(entry.key, gate));
  }
}

function refusalsFor(
  keys: readonly string[],
  refusals: ReadonlyMap<string, IntegrityRefusal>,
  generated: readonly IntegrityRefusal[],
): readonly IntegrityRefusal[] {
  const listed = keys
    .map((key) => refusals.get(key))
    .filter((refusal): refusal is IntegrityRefusal => refusal !== undefined);
  return [...listed, ...generated].sort((left, right) => (left.key < right.key ? -1 : 1));
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

interface ReuseKeys {
  readonly cacheHitKeys: ReadonlySet<string>;
  readonly fuzzyKeys: ReadonlySet<string>;
}

function acceptedOrigin(key: string, reuse: ReuseKeys): ProvenanceOrigin {
  if (reuse.fuzzyKeys.has(key)) {
    return "fuzzy";
  }
  return reuse.cacheHitKeys.has(key) ? "memory" : "machine";
}

function pendingProvenance(
  params: LocaleRunParams,
  accepted: ReadonlyMap<string, Accepted>,
  reuse: ReuseKeys,
  generation: PluralGenerationResult,
): Map<string, PendingProvenance> {
  const pending = new Map<string, PendingProvenance>();
  for (const [key, entry] of accepted) {
    const origin = acceptedOrigin(key, reuse);
    pending.set(key, withAttribution(origin, entry.value, params.machine));
  }
  for (const form of generation.accepted) {
    pending.set(form.targetKey, withAttribution("machine", form.entry.value, params.machine));
  }
  return pending;
}

function withAttribution(
  origin: ProvenanceOrigin,
  value: string,
  attribution: MachineAttribution | undefined,
): PendingProvenance {
  return origin === "machine" && attribution !== undefined
    ? { origin, value, attribution }
    : { origin, value };
}

async function readWrittenTarget(
  params: LocaleRunParams,
  needed: boolean,
  fallback: LocaleResource,
): Promise<LocaleResource> {
  if (!needed) {
    return fallback;
  }
  return readTargetResource({
    resolver: params.resolver,
    format: params.format,
    locale: params.targetLocale,
    adapter: params.adapter,
    fs: params.fs,
  });
}
