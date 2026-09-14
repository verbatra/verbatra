import {
  contentHash,
  diffResources,
  type LocaleResource,
  type TranslationEntry,
} from "@verbatra/core";
import type { WorkbookRow, WorkbookSheet } from "@verbatra/exchange";
import type { FormatAdapter } from "@verbatra/format-adapters";
import { gateCandidateValue, type IntegrityGateReason } from "../integrity-gate.js";
import { deriveLocaleStatus } from "../locale-failure.js";
import type {
  DuplicateKeyReport,
  LocaleSummary,
  MalformedRowReport,
  SdkNotice,
} from "../summary.js";

const CLEAR_SENTINEL = "[[CLEAR]]";

export interface ImportLocaleParams {
  readonly sheet: WorkbookSheet;
  readonly source: LocaleResource;
  readonly target: LocaleResource;
  readonly baseline: ReadonlyMap<string, string>;
  readonly adapter: FormatAdapter;
  readonly sourceInvalidIcuKeys: readonly string[];
  readonly malformedRows: readonly MalformedRowReport[];
  readonly duplicateKeys: readonly DuplicateKeyReport[];
}

export interface ImportLocaleResult {
  readonly summary: LocaleSummary;
  readonly accepted: ReadonlyMap<
    string,
    { readonly value: string; readonly source: TranslationEntry; readonly cleared: boolean }
  >;
  readonly withheld: ReadonlySet<string>;
}

export class UnknownKeyError extends Error {
  readonly key: string;
  constructor(key: string) {
    super(`The workbook has a row with key "${key}" that maps to no known source or target key.`);
    this.name = "UnknownKeyError";
    this.key = key;
  }
}

function isUnknownKey(row: WorkbookRow, source: LocaleResource, target: LocaleResource): boolean {
  return !source.entries.has(row.key) && !target.entries.has(row.key);
}

type Reason = "drift" | IntegrityGateReason;

function judge(
  row: WorkbookRow,
  sourceEntry: TranslationEntry,
  adapter: FormatAdapter,
): Reason | undefined {
  if (contentHash(sourceEntry) !== row.sourceHash) {
    return "drift";
  }
  const gate = gateCandidateValue(sourceEntry, row.translation, adapter);
  return gate.accepted ? undefined : gate.reason;
}

interface Buckets {
  readonly accepted: Map<string, { value: string; source: TranslationEntry; cleared: boolean }>;
  readonly mismatches: string[];
  readonly withheld: Set<string>;
  readonly blankDrifted: Set<string>;
  readonly unfilled: string[];
}

function trackBlankDrift(row: WorkbookRow, params: ImportLocaleParams, buckets: Buckets): void {
  const sourceEntry = params.source.entries.get(row.key);
  if (sourceEntry === undefined) {
    return;
  }
  const priorHash = params.baseline.get(row.key);
  if (priorHash !== undefined && priorHash !== contentHash(sourceEntry)) {
    buckets.blankDrifted.add(row.key);
  }
}

function classifyClear(row: WorkbookRow, sourceEntry: TranslationEntry, buckets: Buckets): void {
  if (contentHash(sourceEntry) !== row.sourceHash) {
    buckets.mismatches.push(row.key);
    buckets.withheld.add(row.key);
    return;
  }
  buckets.accepted.set(row.key, { value: "", source: sourceEntry, cleared: true });
}

function classifyRows(
  params: ImportLocaleParams,
  buckets: Buckets,
  liveCandidates: ReadonlySet<string>,
): void {
  for (const row of params.sheet.rows) {
    if (row.translation === "") {
      if (liveCandidates.has(row.key)) {
        buckets.unfilled.push(row.key);
      }
      trackBlankDrift(row, params, buckets);
      continue;
    }
    if (isUnknownKey(row, params.source, params.target)) {
      throw new UnknownKeyError(row.key);
    }
    const sourceEntry = params.source.entries.get(row.key);
    if (sourceEntry === undefined) {
      continue;
    }
    if (row.translation === CLEAR_SENTINEL) {
      classifyClear(row, sourceEntry, buckets);
      continue;
    }
    const reason = judge(row, sourceEntry, params.adapter);
    if (reason === undefined) {
      buckets.accepted.set(row.key, {
        value: row.translation,
        source: sourceEntry,
        cleared: false,
      });
    } else {
      buckets.mismatches.push(row.key);
      buckets.withheld.add(row.key);
    }
  }
}

function blankRowBaselineNotice(count: number): SdkNotice {
  return {
    code: "BLANK_ROW_BASELINE_RETAINED",
    message:
      `${count} row(s) were left blank for a key whose source changed since the row's baseline ` +
      "was recorded; the prior baseline was kept so the drift keeps being reported.",
  };
}

export function importLocale(params: ImportLocaleParams): ImportLocaleResult {
  const diff = diffResources(params.source, params.target, { baseline: params.baseline });
  const buckets: Buckets = {
    accepted: new Map(),
    mismatches: [],
    withheld: new Set(),
    blankDrifted: new Set(),
    unfilled: [],
  };
  classifyRows(params, buckets, new Set([...diff.missing, ...diff.changed]));

  const rowKeys = new Set(params.sheet.rows.map((row) => row.key));
  const invalidIcuSource = [...new Set(params.sourceInvalidIcuKeys)]
    .filter((key) => rowKeys.has(key))
    .sort();

  const translated = [...buckets.accepted.keys()].sort();
  const integrityMismatches = [...buckets.mismatches].sort();
  const summary: LocaleSummary = {
    locale: params.sheet.locale,
    status: deriveLocaleStatus({
      translated,
      cacheHits: [],
      fuzzyHits: [],
      generated: [],
      integrityMismatches,
      providerFailures: [],
      budgetWithheld: [],
    }),
    translated,
    unchanged: diff.unchanged,
    orphaned: diff.orphaned,
    pruned: [],
    invalidIcuSource,
    cacheHits: [],
    fuzzyHits: [],
    integrityMismatches,
    providerFailures: [],
    budgetWithheld: [],
    generated: [],
    notices:
      buckets.blankDrifted.size > 0 ? [blankRowBaselineNotice(buckets.blankDrifted.size)] : [],
    needsReview: [],
    unfilled: [...new Set(buckets.unfilled)].sort(),
    malformedRows: params.malformedRows,
    duplicateKeys: params.duplicateKeys,
  };
  return { summary, accepted: buckets.accepted, withheld: buckets.withheld };
}
