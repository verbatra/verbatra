import type { ReactNode } from "react";
import { averageCoverage, type StatusData } from "../client/coverage.js";
import { driftKeys, isFullyInSync } from "../client/diff-view.js";
import { attentionEntryCount } from "../client/key-status-filter.js";
import { routeHash } from "../client/routes.js";
import type { RefreshableView } from "../client/state.js";
import { formatCount } from "../client/ui-format.js";
import { MetricCard } from "./MetricCard.js";
import type { DiffState } from "./use-diff-state.js";

export type ReviewWaiting = "loading" | "error" | number;

type Tone = "default" | "success" | "danger";

interface Tile {
  readonly value: string;
  readonly hint: string;
  readonly tone: Tone;
  readonly href?: string;
}

function attentionTile(diff: DiffState): Tile {
  if (diff.kind === "loading") {
    return { value: "…", hint: "Checking pending changes.", tone: "default" };
  }
  if (diff.kind === "error") {
    return {
      value: "N/A",
      hint: "The pending-change check failed.",
      tone: "default",
    };
  }
  if (isFullyInSync(diff.locales)) {
    return { value: "0", hint: "Everything is in sync.", tone: "success" };
  }
  const pending = driftKeys(diff.locales).length;
  const drifting = diff.locales.filter(
    (locale) => locale.missing.length + locale.changed.length + locale.orphaned.length > 0,
  ).length;
  const total = diff.locales.length;
  const entries = attentionEntryCount(diff.locales);
  return {
    value: String(pending),
    hint: `${pending} ${pending === 1 ? "key is" : "keys are"} missing, changed or orphaned (${entries} ${entries === 1 ? "entry" : "entries"} across ${drifting} of ${total} target ${total === 1 ? "locale" : "locales"}).`,
    tone: "danger",
    href: routeHash({
      page: "translations",
      params: { statuses: ["missing", "changed", "orphaned"] },
    }),
  };
}

function reviewTile(waiting: ReviewWaiting): Tile {
  if (waiting === "loading") {
    return { value: "…", hint: "Checking the review queue.", tone: "default" };
  }
  if (waiting === "error") {
    return { value: "N/A", hint: "The review queue check failed.", tone: "default" };
  }
  if (waiting === 0) {
    return { value: "0", hint: "Nothing waits for review.", tone: "success" };
  }
  return {
    value: formatCount(waiting),
    hint: `${waiting === 1 ? "1 translation waits" : `${formatCount(waiting)} translations wait`} for review.`,
    tone: "default",
    href: routeHash({ page: "review", params: {} }),
  };
}

function coverageTile(status: RefreshableView<StatusData>): {
  readonly value: string;
  readonly hint: string;
  readonly progress?: number;
} {
  if (status.kind === "loading") {
    return { value: "…", hint: "Loading locale coverage." };
  }
  if (status.kind === "error") {
    return { value: "N/A", hint: "The coverage check failed." };
  }
  const rows = status.data.rows;
  const average = averageCoverage(rows);
  return {
    value: `${average}%`,
    hint: `Across ${rows.length} target ${rows.length === 1 ? "locale" : "locales"}.`,
    progress: average,
  };
}

function orphanedCount(diff: Extract<DiffState, { readonly kind: "loaded" }>): number {
  return diff.locales.reduce((sum, locale) => sum + locale.orphaned.length, 0);
}

function inSyncHint(status: StatusData, diff: DiffState): string {
  if (!status.inSync) {
    return "At least one locale is out of sync.";
  }
  if (diff.kind === "loading") {
    return "Checking pending changes.";
  }
  if (diff.kind === "error") {
    return "The pending-change check failed.";
  }
  if (isFullyInSync(diff.locales)) {
    return "All target locales are in sync.";
  }
  const orphaned = orphanedCount(diff);
  return orphaned > 0
    ? `Every key is translated; ${orphaned} orphaned ${orphaned === 1 ? "key is" : "keys are"} left over.`
    : "Pending changes remain.";
}

function syncTile(
  status: RefreshableView<StatusData>,
  diff: DiffState,
): { readonly value: string; readonly hint: string } {
  if (status.kind === "loading") {
    return { value: "…", hint: "Loading sync state." };
  }
  if (status.kind === "error") {
    return { value: "N/A", hint: "The sync check failed." };
  }
  const rows = status.data.rows;
  return {
    value: `${rows.filter((row) => row.inSync).length} / ${rows.length}`,
    hint: inSyncHint(status.data, diff),
  };
}

function tileProps(tile: Tile): {
  readonly value: string;
  readonly hint: string;
  readonly tone: Tone;
  readonly hintHref?: string;
} {
  return {
    value: tile.value,
    hint: tile.hint,
    tone: tile.tone,
    ...(tile.href === undefined ? {} : { hintHref: tile.href }),
  };
}

export function OverviewMetrics({
  status,
  diff,
  reviewWaiting,
}: {
  readonly status: RefreshableView<StatusData>;
  readonly diff: DiffState;
  readonly reviewWaiting?: ReviewWaiting | undefined;
}): ReactNode {
  const coverage = coverageTile(status);
  const sync = syncTile(status, diff);
  const columns = reviewWaiting === undefined ? "lg:grid-cols-3" : "lg:grid-cols-4";

  return (
    <div className="mb-10">
      <div className={`grid grid-cols-1 gap-3 xs:grid-cols-2 sm:gap-4 ${columns}`}>
        <MetricCard label="Needs attention" icon="alert" {...tileProps(attentionTile(diff))} />
        {reviewWaiting === undefined ? null : (
          <MetricCard
            label="Waiting for review"
            icon="review"
            {...tileProps(reviewTile(reviewWaiting))}
          />
        )}
        <MetricCard
          label="Avg coverage"
          icon="gauge"
          value={coverage.value}
          hint={coverage.hint}
          {...(coverage.progress === undefined ? {} : { progress: coverage.progress })}
        />
        <MetricCard label="Locales in sync" icon="globe" value={sync.value} hint={sync.hint} />
      </div>
    </div>
  );
}
