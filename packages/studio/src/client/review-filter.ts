import type { MachineClassOrigin } from "@verbatra/sdk";
import type { KeyValuePair } from "./filter.js";
import type { QueueReviewState, ReviewQueueRow } from "./review-queue-data.js";

export interface ReviewFilter {
  readonly locale: string | null;
  readonly query: string;
  readonly origin?: MachineClassOrigin | null;
  readonly reviewState?: QueueReviewState;
}

export const REVIEW_ORIGIN_LABELS: Readonly<Record<MachineClassOrigin, string>> = {
  machine: "Machine",
  memory: "Memory",
  fuzzy: "Fuzzy match",
  agent: "Agent",
};

export const REVIEW_STATE_LABELS: Readonly<Record<QueueReviewState, string>> = {
  unreviewed: "Needs review",
  approved: "Approved",
};

export function uniqueReviewLocales(rows: readonly ReviewQueueRow[]): readonly string[] {
  return [...new Set(rows.map((row) => row.locale))].sort();
}

export function reviewValuesKey(locale: string, key: string): string {
  return `${locale}\t${key}`;
}

function rowValueMatches(
  row: ReviewQueueRow,
  query: string,
  values: ReadonlyMap<string, KeyValuePair> | undefined,
): boolean {
  const pair = values?.get(reviewValuesKey(row.locale, row.key));
  if (pair === undefined) {
    return false;
  }
  return (
    (pair.source?.toLowerCase().includes(query) ?? false) ||
    (pair.target?.toLowerCase().includes(query) ?? false)
  );
}

function matchesFacets(row: ReviewQueueRow, filter: ReviewFilter): boolean {
  const origin = filter.origin ?? null;
  return (
    (filter.locale === null || row.locale === filter.locale) &&
    (origin === null || row.origin === origin) &&
    row.reviewState === (filter.reviewState ?? "unreviewed")
  );
}

export function filterReviewRows(
  rows: readonly ReviewQueueRow[],
  filter: ReviewFilter,
  values?: ReadonlyMap<string, KeyValuePair>,
): readonly ReviewQueueRow[] {
  const query = filter.query.trim().toLowerCase();
  return rows.filter(
    (row) =>
      matchesFacets(row, filter) &&
      (query === "" ||
        row.key.toLowerCase().includes(query) ||
        rowValueMatches(row, query, values)),
  );
}
