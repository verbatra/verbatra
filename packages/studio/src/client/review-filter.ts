import type { KeyValuePair } from "./filter.js";
import type { ReviewQueueRow } from "./review-queue-data.js";

export interface ReviewFilter {
  readonly locale: string | null;
  readonly query: string;
}

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

export function filterReviewRows(
  rows: readonly ReviewQueueRow[],
  filter: ReviewFilter,
  values?: ReadonlyMap<string, KeyValuePair>,
): readonly ReviewQueueRow[] {
  const query = filter.query.trim().toLowerCase();
  return rows.filter(
    (row) =>
      (filter.locale === null || row.locale === filter.locale) &&
      (query === "" ||
        row.key.toLowerCase().includes(query) ||
        rowValueMatches(row, query, values)),
  );
}
