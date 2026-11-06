import type { RpcResultFor } from "../shared/rpc/contract.js";
import type { RpcCallResult } from "./rpc-client.js";
import type { FetchOutcome } from "./state.js";

export interface LocaleCoverageCounts {
  readonly missing: number;
  readonly stale: number;
  readonly upToDate: number;
}

export interface StatusRow extends LocaleCoverageCounts {
  readonly locale: string;
  readonly percent: number;
  readonly inSync: boolean;
}

export interface StatusData {
  readonly inSync: boolean;
  readonly rows: readonly StatusRow[];
}

export function coveragePercent(counts: LocaleCoverageCounts): number {
  const total = counts.missing + counts.stale + counts.upToDate;
  if (total === 0) {
    return 100;
  }
  return Math.round((counts.upToDate / total) * 100);
}

export function averageCoverage(rows: readonly StatusRow[]): number {
  if (rows.length === 0) {
    return 100;
  }
  return Math.round(rows.reduce((sum, row) => sum + row.percent, 0) / rows.length);
}

export function toStatusData(result: RpcResultFor<"status.check">): StatusData {
  const rows = result.locales.map((locale) => ({ ...locale, percent: coveragePercent(locale) }));
  return { inSync: result.inSync, rows };
}

export function toStatusOutcome(response: RpcCallResult<"status.check">): FetchOutcome<StatusData> {
  if (!response.ok) {
    return { ok: false, error: response.error };
  }
  return { ok: true, result: toStatusData(response.result) };
}

export function sortWorstFirst(rows: readonly StatusRow[]): readonly StatusRow[] {
  return [...rows].sort(
    (left, right) =>
      left.percent - right.percent ||
      right.missing - left.missing ||
      left.locale.localeCompare(right.locale),
  );
}
