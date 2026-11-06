import type { StatusData } from "../client/coverage.js";
import type { RefreshableView, StructuredError } from "../client/state.js";
import type { DiffState } from "./use-diff-state.js";
import type { LockView } from "./use-lock-state.js";

export interface PageFailure {
  readonly error: StructuredError;
  readonly prefix?: string;
}

interface Source {
  readonly label: string;
  readonly error: StructuredError | undefined;
  readonly stale: boolean;
}

function diffSource(diff: DiffState): Source {
  if (diff.kind === "error") {
    return { label: "pending changes", error: diff.error, stale: false };
  }
  return {
    label: "pending changes",
    error: diff.kind === "loaded" ? diff.staleError : undefined,
    stale: true,
  };
}

function statusSource(status: RefreshableView<StatusData>): Source {
  if (status.kind === "error") {
    return { label: "status", error: status.error, stale: false };
  }
  return {
    label: "status",
    error: status.kind === "data" && status.stale ? status.error : undefined,
    stale: true,
  };
}

function lockSource(lock: LockView): Source {
  if (lock.kind === "error") {
    return { label: "lock file", error: lock.error, stale: false };
  }
  return {
    label: "lock file",
    error: lock.kind === "loaded" ? lock.staleError : undefined,
    stale: true,
  };
}

export function pageFailure(
  diff: DiffState,
  status: RefreshableView<StatusData>,
  lock: LockView,
): PageFailure | null {
  const failed = [diffSource(diff), statusSource(status), lockSource(lock)].filter(
    (source) => source.error !== undefined,
  );
  const hard = failed.find((source) => !source.stale);
  if (hard?.error !== undefined) {
    return { error: hard.error };
  }
  const first = failed[0];
  if (first?.error === undefined) {
    return null;
  }
  const code = first.error.code;
  const labels = failed
    .filter((source) => source.error?.code === code)
    .map((source) => source.label)
    .join(", ");
  return { error: first.error, prefix: `Showing the last known ${labels}.` };
}
