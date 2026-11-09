import type { LocaleResource } from "@verbatra/core";
import type { AdapterRegistry } from "@verbatra/format-adapters";
import { modelOf } from "../config/provider-billing.js";
import type { VerbatraConfig } from "../config/schema.js";
import { check } from "../flow/check.js";
import { priceRun, sourceCharactersOfRun } from "../flow/estimate.js";
import type { LocaleSummary, RunSummary, UsageSummary } from "../flow/summary.js";
import type { SdkFs } from "../fs.js";
import {
  RUN_HISTORY_LIMITS,
  RUN_HISTORY_VERSION,
  type RunHistoryCoverage,
  type RunHistoryRecordParsed,
  type RunHistoryTrigger,
} from "./record.js";
import { appendRunHistoryRecord } from "./run-history-file.js";

export interface RunHistoryContext {
  readonly config: VerbatraConfig;
  readonly cwd: string;
  readonly fs: SdkFs;
  readonly adapterRegistry?: AdapterRegistry | undefined;
  readonly acquireTimeoutMs?: number;
}

export interface DraftLocale {
  readonly locale: string;
  readonly status: "succeeded" | "partial" | "failed";
  readonly translated: number;
  readonly cacheHits: number;
  readonly fuzzyHits: number;
  readonly generated: number;
  readonly pruned: number;
  readonly integrityMismatches: number;
  readonly providerFailures: number;
  readonly usage?: UsageSummary | undefined;
}

export interface RunDraft {
  readonly trigger: RunHistoryTrigger;
  readonly entries?: number;
  readonly locales: readonly DraftLocale[];
  readonly usage?: UsageSummary | undefined;
  readonly sourceCharacters: number;
  readonly keysSent: boolean;
}

function localeLeavesNoTrace(locale: LocaleSummary): boolean {
  return (
    locale.status === "succeeded" &&
    locale.usage === undefined &&
    locale.translated.length === 0 &&
    locale.cacheHits.length === 0 &&
    locale.fuzzyHits.length === 0 &&
    locale.generated.length === 0 &&
    locale.pruned.length === 0 &&
    locale.integrityMismatches.length === 0 &&
    locale.providerFailures.length === 0
  );
}

export function runLeavesNoTrace(summary: RunSummary): boolean {
  return summary.usage === undefined && summary.locales.every(localeLeavesNoTrace);
}

function draftLocale(locale: LocaleSummary): DraftLocale {
  return {
    locale: locale.locale,
    status: locale.status,
    translated: locale.translated.length,
    cacheHits: locale.cacheHits.length,
    fuzzyHits: locale.fuzzyHits.length,
    generated: locale.generated.length,
    pruned: locale.pruned.length,
    integrityMismatches: locale.integrityMismatches.length,
    providerFailures: locale.providerFailures.length,
    usage: locale.usage,
  };
}

export function draftFromSummary(
  summary: RunSummary,
  source: LocaleResource,
  config: VerbatraConfig,
): RunDraft {
  const touched = summary.locales.filter((locale) => !localeLeavesNoTrace(locale));
  return {
    trigger: "translate",
    locales: touched.map(draftLocale),
    usage: summary.usage,
    sourceCharacters: sourceCharactersOfRun(source, config, touched),
    keysSent: touched.some(
      (locale) =>
        locale.translated.length +
          locale.generated.length +
          locale.integrityMismatches.length +
          locale.providerFailures.length >
        0,
    ),
  };
}

async function measureCoverage(
  context: RunHistoryContext,
  locales: readonly string[],
): Promise<ReadonlyMap<string, RunHistoryCoverage> | undefined> {
  if (locales.length === 0) {
    return new Map();
  }
  try {
    const summary = await check(
      { config: context.config, cwd: context.cwd, locales },
      {
        fs: context.fs,
        ...(context.adapterRegistry === undefined
          ? {}
          : { adapterRegistry: context.adapterRegistry }),
      },
    );
    return new Map(
      summary.locales.map((entry) => [
        entry.locale,
        { missing: entry.missing, stale: entry.stale, upToDate: entry.upToDate },
      ]),
    );
  } catch {
    return undefined;
  }
}

function localeRecord(
  locale: DraftLocale,
  coverage: ReadonlyMap<string, RunHistoryCoverage> | undefined,
): RunHistoryRecordParsed["locales"][number] {
  const measured = coverage?.get(locale.locale);
  return {
    locale: locale.locale.slice(0, RUN_HISTORY_LIMITS.locale),
    status: locale.status,
    translated: locale.translated,
    cacheHits: locale.cacheHits,
    fuzzyHits: locale.fuzzyHits,
    generated: locale.generated,
    pruned: locale.pruned,
    integrityMismatches: locale.integrityMismatches,
    providerFailures: locale.providerFailures,
    ...(locale.usage === undefined ? {} : { usage: locale.usage }),
    ...(measured === undefined ? {} : { coverage: measured }),
  };
}

export async function buildRunHistoryRecord(
  context: RunHistoryContext,
  draft: RunDraft,
): Promise<RunHistoryRecordParsed> {
  const { config } = context;
  const coverage = await measureCoverage(
    context,
    draft.locales.map((locale) => locale.locale),
  );
  const model = modelOf(config.provider);
  return {
    version: RUN_HISTORY_VERSION,
    at: new Date().toISOString(),
    trigger: draft.trigger,
    provider: config.provider.id,
    ...(model === undefined ? {} : { model: model.slice(0, RUN_HISTORY_LIMITS.model) }),
    ...(draft.entries === undefined ? {} : { entries: draft.entries }),
    ...(draft.usage === undefined ? {} : { usage: draft.usage }),
    cost: priceRun({
      provider: config.provider,
      rates: config.rates,
      usage: draft.usage,
      sourceCharacters: draft.sourceCharacters,
      keysSent: draft.keysSent,
    }),
    locales: draft.locales.map((locale) => localeRecord(locale, coverage)),
    ...(coverage === undefined ? { coverageUnavailable: true as const } : {}),
  };
}

export async function recordRunHistory(context: RunHistoryContext, draft: RunDraft): Promise<void> {
  try {
    const record = await buildRunHistoryRecord(context, draft);
    await appendRunHistoryRecord(context.cwd, context.fs, record, context.acquireTimeoutMs);
  } catch {}
}
