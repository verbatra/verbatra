import type { RunHistoryCost, RunHistoryRecord } from "@verbatra/sdk";
import type { RpcResultFor } from "../shared/rpc/contract.js";
import { coveragePercent } from "./coverage.js";
import type { RpcCallResult } from "./rpc-client.js";
import type { FetchOutcome } from "./state.js";
import type { TrendPoint } from "./trend-geometry.js";
import { UI_LOCALE } from "./ui-format.js";

export type RunHistoryData = RpcResultFor<"usage.history">;

export const RUN_HISTORY_REQUEST_LIMIT = 30;

export type CostKind =
  | "priced"
  | "estimated"
  | "lower-bound"
  | "no-rate"
  | "unknown"
  | "not-billed";

export interface CostDisplay {
  readonly kind: CostKind;
  readonly label: string;
  readonly hint: string | undefined;
  readonly caveats: readonly string[];
  readonly amount: number | undefined;
  readonly currency: string | undefined;
}

const CAVEAT_TEXT: Readonly<Record<string, string>> = {
  SOURCE_DUPLICATES_NOT_DEDUPLICATED: "Repeated source strings are counted every time.",
  TRANSPORT_RETRIES_NOT_COUNTED: "Retried requests are not counted.",
  USAGE_PARTIAL: "A locale sent keys and reported no tokens, so this is a lower bound.",
};

const PROVIDER_FAILURES_CAVEAT = "Keys the provider failed on are not counted.";

const currencyFormats = new Map<string, Intl.NumberFormat>();

function currencyFormat(currency: string): Intl.NumberFormat {
  const known = currencyFormats.get(currency);
  if (known !== undefined) {
    return known;
  }
  const created = new Intl.NumberFormat(UI_LOCALE, {
    style: "currency",
    currency,
    maximumFractionDigits: 4,
  });
  currencyFormats.set(currency, created);
  return created;
}

const SMALLEST_SHOWN = 0.0001;

export function formatCost(amount: number, currency: string): string {
  const format = currencyFormat(currency);
  if (amount > 0 && amount < SMALLEST_SHOWN) {
    return `under ${format.format(SMALLEST_SHOWN)}`;
  }
  return format.format(amount);
}

function caveatTexts(codes: readonly string[] | undefined): readonly string[] {
  return (codes ?? []).map((code) => CAVEAT_TEXT[code] ?? code);
}

function reportsPartialUsage(cost: RunHistoryCost): boolean {
  return "caveats" in cost && cost.caveats?.includes("USAGE_PARTIAL") === true;
}

const PARTIAL_TOKENS_TEXT =
  "A locale sent keys and reported no tokens, so the token count is a lower bound.";

function partialTokenCaveats(cost: RunHistoryCost): readonly string[] {
  return reportsPartialUsage(cost) ? [PARTIAL_TOKENS_TEXT] : [];
}

function pricedDisplay(cost: Extract<RunHistoryCost, { pricing: "priced" }>): CostDisplay {
  const formatted = formatCost(cost.amount, cost.currency);
  const common = { amount: cost.amount, currency: cost.currency } as const;
  if (cost.basis === "source-characters") {
    return {
      kind: "estimated",
      label: `estimated ${formatted}`,
      hint: `Estimated from the source characters sent, at the ${cost.rateKey} rate of ${cost.asOf}.`,
      caveats: [...caveatTexts(cost.caveats), PROVIDER_FAILURES_CAVEAT],
      ...common,
    };
  }
  if (reportsPartialUsage(cost)) {
    return {
      kind: "lower-bound",
      label: `at least ${formatted}`,
      hint: `Priced at the ${cost.rateKey} rate of ${cost.asOf}.`,
      caveats: caveatTexts(cost.caveats),
      ...common,
    };
  }
  return {
    kind: "priced",
    label: formatted,
    hint: `Priced at the ${cost.rateKey} rate of ${cost.asOf}.`,
    caveats: caveatTexts(cost.caveats),
    ...common,
  };
}

const NO_AMOUNT = { amount: undefined, currency: undefined } as const;

export function describeCost(cost: RunHistoryCost): CostDisplay {
  switch (cost.pricing) {
    case "priced":
      return pricedDisplay(cost);
    case "no-rate-on-file":
      return {
        kind: "no-rate",
        label: "no rate",
        hint: `No rate was on file for ${cost.rateKey} when the run ended.`,
        caveats: partialTokenCaveats(cost),
        ...NO_AMOUNT,
      };
    case "rate-unit-mismatch":
      return {
        kind: "no-rate",
        label: "no rate",
        hint: `The rate on file for ${cost.rateKey} was in a different unit than this run was measured in when the run ended.`,
        caveats: partialTokenCaveats(cost),
        ...NO_AMOUNT,
      };
    case "no-usage":
      return {
        kind: "unknown",
        label: "unknown",
        hint: "Keys were sent, but the provider reported no tokens, so no cost can be worked out.",
        caveats: [],
        ...NO_AMOUNT,
      };
    case "not-billed":
      return {
        kind: "not-billed",
        label: "not billed",
        hint: "verbatra does not price this provider. A hosted openai-compatible endpoint may still bill you.",
        caveats: partialTokenCaveats(cost),
        ...NO_AMOUNT,
      };
  }
}

export interface LocaleTotals {
  readonly translated: number;
  readonly cacheHits: number;
  readonly fuzzyHits: number;
  readonly generated: number;
  readonly pruned: number;
  readonly integrityMismatches: number;
  readonly providerFailures: number;
  readonly failedLocales: number;
  readonly partialLocales: number;
}

export function totalLocales(record: RunHistoryRecord): LocaleTotals {
  const totals = {
    translated: 0,
    cacheHits: 0,
    fuzzyHits: 0,
    generated: 0,
    pruned: 0,
    integrityMismatches: 0,
    providerFailures: 0,
    failedLocales: 0,
    partialLocales: 0,
  };
  for (const locale of record.locales) {
    if (locale.status === "failed") {
      totals.failedLocales += 1;
    } else if (locale.status === "partial") {
      totals.partialLocales += 1;
    }
    totals.translated += locale.translated;
    totals.cacheHits += locale.cacheHits;
    totals.fuzzyHits += locale.fuzzyHits;
    totals.generated += locale.generated;
    totals.pruned += locale.pruned;
    totals.integrityMismatches += locale.integrityMismatches;
    totals.providerFailures += locale.providerFailures;
  }
  return totals;
}

export function describeTrigger(record: RunHistoryRecord): string {
  if (record.trigger === "translate") {
    return "Translate";
  }
  if (record.entries === undefined) {
    return "Retranslate";
  }
  return `Retranslate, ${record.entries} ${record.entries === 1 ? "entry" : "entries"}`;
}

export function describeProvider(record: RunHistoryRecord): string {
  return record.model === undefined ? record.provider : `${record.provider} / ${record.model}`;
}

export interface TokenDisplay {
  readonly reported: boolean;
  readonly total: number | undefined;
  readonly input: number | undefined;
  readonly output: number | undefined;
  readonly lowerBound: boolean;
}

export function describeTokens(record: RunHistoryRecord): TokenDisplay {
  if (record.usage === undefined) {
    return {
      reported: false,
      total: undefined,
      input: undefined,
      output: undefined,
      lowerBound: false,
    };
  }
  return {
    reported: true,
    total: record.usage.inputTokens + record.usage.outputTokens,
    input: record.usage.inputTokens,
    output: record.usage.outputTokens,
    lowerBound: reportsPartialUsage(record.cost),
  };
}

export interface CoverageRow {
  readonly locale: string;
  readonly known:
    | {
        readonly missing: number;
        readonly stale: number;
        readonly upToDate: number;
        readonly measuredAt: string;
      }
    | undefined;
  readonly measuredInLatestRun: boolean;
  readonly coverageCheckFailed: boolean;
}

export function lastKnownCoverage(records: readonly RunHistoryRecord[]): readonly CoverageRow[] {
  const latest = records[0];
  if (latest === undefined) {
    return [];
  }
  const latestCheckFailed = latest.coverageUnavailable === true;
  const latestLocales = new Set(latest.locales.map((entry) => entry.locale));
  const rows = new Map<string, CoverageRow>();
  for (const record of records) {
    for (const entry of record.locales) {
      const held = rows.get(entry.locale);
      const coverageCheckFailed = latestCheckFailed && latestLocales.has(entry.locale);
      if (entry.coverage !== undefined && (held === undefined || held.known === undefined)) {
        rows.set(entry.locale, {
          locale: entry.locale,
          known: { ...entry.coverage, measuredAt: record.at },
          measuredInLatestRun: record === latest,
          coverageCheckFailed,
        });
      } else if (held === undefined) {
        rows.set(entry.locale, {
          locale: entry.locale,
          known: undefined,
          measuredInLatestRun: false,
          coverageCheckFailed,
        });
      }
    }
  }
  return [...rows.values()].sort(worstCoverageFirst);
}

function byLocale(left: CoverageRow, right: CoverageRow): number {
  return left.locale.localeCompare(right.locale, UI_LOCALE);
}

function worstCoverageFirst(left: CoverageRow, right: CoverageRow): number {
  const { known: leftKnown } = left;
  const { known: rightKnown } = right;
  if (leftKnown === undefined || rightKnown === undefined) {
    return (
      Number(leftKnown === undefined) - Number(rightKnown === undefined) || byLocale(left, right)
    );
  }
  return (
    coveragePercent(leftKnown) - coveragePercent(rightKnown) ||
    rightKnown.missing - leftKnown.missing ||
    byLocale(left, right)
  );
}

export interface CostSeries {
  readonly currency: string | undefined;
  readonly points: readonly TrendPoint[];
  readonly otherCurrencies: number;
}

function busiestCurrency(newestFirst: readonly CostDisplay[]): string | undefined {
  const counts = new Map<string, number>();
  for (const display of newestFirst) {
    if (display.amount !== undefined && display.currency !== undefined) {
      counts.set(display.currency, (counts.get(display.currency) ?? 0) + 1);
    }
  }
  let best: string | undefined;
  let bestCount = 0;
  for (const [currency, count] of counts) {
    if (count > bestCount) {
      best = currency;
      bestCount = count;
    }
  }
  return best;
}

export function costSeries(records: readonly RunHistoryRecord[]): CostSeries {
  const chronological = [...records].reverse();
  const displays = chronological.map((record) => describeCost(record.cost));
  const currency = busiestCurrency([...displays].reverse());
  let otherCurrencies = 0;
  const points = displays.map((display): TrendPoint => {
    if (display.amount === undefined) {
      return { value: undefined, hollow: false };
    }
    if (display.currency !== currency) {
      otherCurrencies += 1;
      return { value: undefined, hollow: false };
    }
    return { value: display.amount, hollow: display.kind !== "priced" };
  });
  return { currency, points, otherCurrencies };
}

export function tokenSeries(records: readonly RunHistoryRecord[]): readonly TrendPoint[] {
  return [...records].reverse().map(
    (record): TrendPoint => ({
      value: describeTokens(record).total,
      hollow: describeTokens(record).lowerBound,
    }),
  );
}

export type RunHistoryNotice =
  | { readonly kind: "unavailable"; readonly reason: "unreadable" | "too-large" }
  | { readonly kind: "unreadable-records"; readonly count: number }
  | { readonly kind: "truncated"; readonly shown: number; readonly total: number };

export type RunHistoryDisplay = {
  readonly records: readonly RunHistoryRecord[];
  readonly notices: readonly RunHistoryNotice[];
  readonly empty: boolean;
};

export function toRunHistoryDisplay(data: RunHistoryData): RunHistoryDisplay {
  const notices: RunHistoryNotice[] = [];
  if (data.unavailable !== undefined) {
    notices.push({ kind: "unavailable", reason: data.unavailable });
  }
  if (data.unreadableRecords > 0) {
    notices.push({ kind: "unreadable-records", count: data.unreadableRecords });
  }
  if (data.total > data.records.length) {
    notices.push({ kind: "truncated", shown: data.records.length, total: data.total });
  }
  return {
    records: data.records,
    notices,
    empty:
      data.records.length === 0 && data.unavailable === undefined && data.unreadableRecords === 0,
  };
}

export function toRunHistoryOutcome(
  response: RpcCallResult<"usage.history">,
): FetchOutcome<RunHistoryData> {
  if (!response.ok) {
    return { ok: false, error: response.error };
  }
  return { ok: true, result: response.result };
}
