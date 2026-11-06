import type { StatusData } from "../client/coverage.js";
import type { ReviewQueueData } from "../client/review-queue-data.js";
import type { RefreshableView, StructuredError } from "../client/state.js";
import type { UsageTickerData } from "../client/usage-ticker-data.js";
import type { DiffState } from "./use-diff-state.js";
import type { HistoryState } from "./use-history-list.js";
import type { LockView } from "./use-lock-state.js";

export interface PageFailure {
  readonly error: StructuredError;
  readonly prefix?: string;
}

export interface OverviewReads {
  readonly diff: DiffState;
  readonly status: RefreshableView<StatusData>;
  readonly lock: LockView;
  readonly review: RefreshableView<ReviewQueueData> | undefined;
  readonly usage: RefreshableView<UsageTickerData>;
  readonly history: HistoryState;
}

interface Source {
  readonly label: string;
  readonly error: StructuredError | undefined;
  readonly stale: boolean;
}

function hard(label: string, error: StructuredError): Source {
  return { label, error, stale: false };
}

function kept(label: string, error: StructuredError | undefined): Source {
  return { label, error, stale: true };
}

function refreshable(
  label: string,
  view: RefreshableView<unknown> | undefined,
): Source | undefined {
  if (view === undefined) {
    return undefined;
  }
  if (view.kind === "error") {
    return hard(label, view.error);
  }
  return kept(label, view.kind === "data" && view.stale ? view.error : undefined);
}

function diffSource(diff: DiffState): Source {
  if (diff.kind === "error") {
    return hard("pending changes", diff.error);
  }
  return kept("pending changes", diff.kind === "loaded" ? diff.staleError : undefined);
}

function lockSource(lock: LockView): Source {
  if (lock.kind === "error") {
    return hard("lock file", lock.error);
  }
  return kept("lock file", lock.kind === "loaded" ? lock.staleError : undefined);
}

function historySource(history: HistoryState): Source {
  if (history.kind === "error") {
    return hard("history", history.error);
  }
  return kept("history", history.kind === "loaded" ? history.staleError : undefined);
}

function joinLabels(labels: readonly string[]): string {
  const last = labels.at(-1);
  if (labels.length < 2 || last === undefined) {
    return labels.join("");
  }
  return `${labels.slice(0, -1).join(", ")} and ${last}`;
}

export function pageFailure(reads: OverviewReads): PageFailure | null {
  const failed = [
    diffSource(reads.diff),
    refreshable("status", reads.status),
    lockSource(reads.lock),
    refreshable("review queue", reads.review),
    refreshable("usage", reads.usage),
    historySource(reads.history),
  ].filter((source): source is Source => source?.error !== undefined);
  const primary = failed.find((source) => !source.stale) ?? failed[0];
  if (primary?.error === undefined) {
    return null;
  }
  const code = primary.error.code;
  const staleLabels = failed
    .filter((source) => source.stale && source.error?.code === code)
    .map((source) => source.label);
  return staleLabels.length === 0
    ? { error: primary.error }
    : { error: primary.error, prefix: `Showing the last known ${joinLabels(staleLabels)}.` };
}
