import {
  contentHash,
  diffResources,
  type LocaleResource,
  type TranslationEntry,
} from "@verbatra/core";
import type { WorkbookRow, WorkbookSheet, XliffState } from "@verbatra/exchange";
import type { FormatAdapter } from "@verbatra/format-adapters";
import { gateCandidateValue, type IntegrityGateRejection, refusalOf } from "../integrity-gate.js";
import { deriveLocaleStatus } from "../locale-failure.js";
import type {
  DuplicateKeyReport,
  IntegrityRefusal,
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
  readonly states?: ReadonlyMap<string, XliffState>;
}

export interface ImportLocaleResult {
  readonly summary: LocaleSummary;
  readonly accepted: ReadonlyMap<
    string,
    { readonly value: string; readonly source: TranslationEntry; readonly cleared: boolean }
  >;
  readonly withheld: ReadonlySet<string>;
  readonly approved: ReadonlySet<string>;
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

type Verdict = "accepted" | "drift" | IntegrityGateRejection;

function judge(
  row: WorkbookRow,
  sourceEntry: TranslationEntry,
  adapter: FormatAdapter,
  targetLocale: string,
): Verdict {
  if (contentHash(sourceEntry) !== row.sourceHash) {
    return "drift";
  }
  const gate = gateCandidateValue(sourceEntry, row.translation, adapter, targetLocale);
  return gate.accepted ? "accepted" : gate;
}

interface Buckets {
  readonly accepted: Map<string, { value: string; source: TranslationEntry; cleared: boolean }>;
  readonly mismatches: string[];
  readonly refusals: IntegrityRefusal[];
  readonly withheld: Set<string>;
  readonly blankDrifted: Set<string>;
  readonly unfilled: string[];
  readonly approved: Set<string>;
}

function isApprovedState(state: XliffState | undefined): boolean {
  return state === "reviewed" || state === "final";
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

function classifyTranslation(
  row: WorkbookRow,
  sourceEntry: TranslationEntry,
  params: ImportLocaleParams,
  buckets: Buckets,
): void {
  const verdict = judge(row, sourceEntry, params.adapter, params.target.locale);
  if (verdict === "accepted") {
    buckets.accepted.set(row.key, { value: row.translation, source: sourceEntry, cleared: false });
    if (isApprovedState(params.states?.get(row.key))) {
      buckets.approved.add(row.key);
    }
    return;
  }
  buckets.mismatches.push(row.key);
  buckets.withheld.add(row.key);
  if (verdict !== "drift") {
    buckets.refusals.push(refusalOf(row.key, verdict));
  }
}

type Echo = "none" | "unfilled" | "kept";

function classifyEcho(
  row: WorkbookRow,
  sourceEntry: TranslationEntry,
  params: ImportLocaleParams,
  buckets: Buckets,
  liveCandidates: ReadonlySet<string>,
): Echo {
  const state = params.states?.get(row.key);
  if (state === undefined || params.target.entries.get(row.key)?.value !== row.translation) {
    return "none";
  }
  if (liveCandidates.has(row.key)) {
    return state === "initial" ? "unfilled" : "none";
  }
  if (isApprovedState(state) && contentHash(sourceEntry) === row.sourceHash) {
    buckets.approved.add(row.key);
  }
  return "kept";
}

function classifyBlank(
  row: WorkbookRow,
  params: ImportLocaleParams,
  buckets: Buckets,
  liveCandidates: ReadonlySet<string>,
): void {
  if (liveCandidates.has(row.key)) {
    buckets.unfilled.push(row.key);
  }
  trackBlankDrift(row, params, buckets);
}

function classifyFilled(
  row: WorkbookRow,
  sourceEntry: TranslationEntry,
  params: ImportLocaleParams,
  buckets: Buckets,
  liveCandidates: ReadonlySet<string>,
): void {
  if (row.translation === CLEAR_SENTINEL) {
    classifyClear(row, sourceEntry, buckets);
    return;
  }
  const echo = classifyEcho(row, sourceEntry, params, buckets, liveCandidates);
  if (echo === "unfilled") {
    classifyBlank(row, params, buckets, liveCandidates);
  } else if (echo === "none") {
    classifyTranslation(row, sourceEntry, params, buckets);
  }
}

function classifyRows(
  params: ImportLocaleParams,
  buckets: Buckets,
  liveCandidates: ReadonlySet<string>,
): void {
  for (const row of params.sheet.rows) {
    if (row.translation === "") {
      classifyBlank(row, params, buckets, liveCandidates);
      continue;
    }
    if (isUnknownKey(row, params.source, params.target)) {
      throw new UnknownKeyError(row.key);
    }
    const sourceEntry = params.source.entries.get(row.key);
    if (sourceEntry !== undefined) {
      classifyFilled(row, sourceEntry, params, buckets, liveCandidates);
    }
  }
}

function blankRowBaselineNotice(count: number): SdkNotice {
  return {
    code: "BLANK_ROW_BASELINE_RETAINED",
    message:
      `${count === 1 ? "1 row was" : `${count} rows were`} left blank for a key whose source changed since the row's baseline ` +
      "was recorded; the prior baseline was kept so the drift keeps being reported.",
  };
}

export function importLocale(params: ImportLocaleParams): ImportLocaleResult {
  const diff = diffResources(params.source, params.target, { baseline: params.baseline });
  const buckets: Buckets = {
    accepted: new Map(),
    mismatches: [],
    refusals: [],
    withheld: new Set(),
    blankDrifted: new Set(),
    unfilled: [],
    approved: new Set(),
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
      sensitiveWithheld: [],
    }),
    translated,
    unchanged: diff.unchanged.filter(
      (key) => !buckets.accepted.has(key) && !buckets.withheld.has(key),
    ),
    orphaned: diff.orphaned,
    pruned: [],
    invalidIcuSource,
    cacheHits: [],
    fuzzyHits: [],
    integrityMismatches,
    integrityRefusals: [...buckets.refusals].sort((left, right) => (left.key < right.key ? -1 : 1)),
    providerFailures: [],
    budgetWithheld: [],
    sensitiveWithheld: [],
    generated: [],
    notices:
      buckets.blankDrifted.size > 0 ? [blankRowBaselineNotice(buckets.blankDrifted.size)] : [],
    needsReview: [],
    unfilled: [...new Set(buckets.unfilled)].sort(),
    protected: [],
    malformedRows: params.malformedRows,
    duplicateKeys: params.duplicateKeys,
  };
  return {
    summary,
    accepted: buckets.accepted,
    withheld: buckets.withheld,
    approved: buckets.approved,
  };
}
