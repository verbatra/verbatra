import type { BudgetStanding } from "@verbatra/sdk";
import { Skeleton } from "@verbatra/ui";
import type { ReactNode } from "react";
import {
  averageCoverage,
  outOfSyncCount,
  type StatusData,
  type StatusRow,
} from "../client/coverage.js";
import { driftKeys, isFullyInSync } from "../client/diff-view.js";
import type { RefreshableView } from "../client/state.js";
import { formatCount, formatTimestamp } from "../client/ui-format.js";
import { toUsageTickerDisplayState, type UsageTickerData } from "../client/usage-ticker-data.js";
import { MetricCard } from "./MetricCard.js";
import type { DiffState } from "./use-diff-state.js";

function attentionTile(
  diff: DiffState,
  rows: readonly StatusRow[] | null,
): {
  readonly value: string;
  readonly hint: string;
  readonly tone: "default" | "success" | "danger";
} {
  if (diff.kind === "loading") {
    return { value: "…", hint: "Checking pending changes.", tone: "default" };
  }
  if (diff.kind === "error") {
    return {
      value: "N/A",
      hint: "The pending-change check failed; details below.",
      tone: "default",
    };
  }
  if (isFullyInSync(diff.locales)) {
    return { value: "0", hint: "Everything is in sync.", tone: "success" };
  }
  const pending = driftKeys(diff.locales).length;
  const across =
    rows !== null
      ? `Across ${outOfSyncCount(rows)} of ${rows.length} target ${rows.length === 1 ? "locale" : "locales"}.`
      : "Across your target locales.";
  return { value: String(pending), hint: across, tone: "danger" };
}

const STANDING_HINT: Record<BudgetStanding, string> = {
  within: "Within budget. ",
  "stopped-before-ceiling": "Stopped before the budget ceiling. ",
  reached: "Budget ceiling reached. ",
};

export type UsageView = RefreshableView<UsageTickerData>;

function lastRunTile(view: UsageView): {
  readonly value: string;
  readonly hint: string;
} {
  if (view.kind !== "data") {
    return { value: "…", hint: "Loading the last recorded run." };
  }
  const state = toUsageTickerDisplayState(view.data);
  if (state.kind !== "available") {
    return { value: "No run yet", hint: "Run verbatra translate or watch to record one." };
  }
  const usage =
    state.usage.kind === "reported"
      ? `${formatCount(state.usage.inputTokens)} / ${formatCount(state.usage.outputTokens)}`
      : "Not reported";
  const budget = state.budget.kind === "tracked" ? STANDING_HINT[state.budget.standing] : "";
  const hintLead =
    state.usage.kind === "reported"
      ? "Tokens in / out. "
      : "No token usage was recorded: the run called no provider, or its provider does not report usage. ";
  return {
    value: usage,
    hint: `${hintLead}${budget}As of ${formatTimestamp(state.generatedAt)}`,
  };
}

export function OverviewMetrics({
  status,
  diff,
  usage,
}: {
  readonly status: RefreshableView<StatusData>;
  readonly diff: DiffState;
  readonly usage: UsageView;
}): ReactNode {
  const rows = status.kind === "data" ? status.data.rows : null;
  const attention = attentionTile(diff, rows);
  const lastRun = lastRunTile(usage);
  const inSyncCount = rows === null ? null : rows.filter((row) => row.inSync).length;

  return (
    <div className="mb-10">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Needs attention"
          icon="alert"
          value={attention.value}
          hint={attention.hint}
          tone={attention.tone}
        />
        <MetricCard
          label="Avg coverage"
          icon="gauge"
          value={rows === null ? "…" : `${averageCoverage(rows)}%`}
          {...(rows === null ? {} : { progress: averageCoverage(rows) })}
          hint={
            rows === null
              ? "Loading locale coverage."
              : `Across ${rows.length} target ${rows.length === 1 ? "locale" : "locales"}.`
          }
        />
        <MetricCard
          label="Locales in sync"
          icon="globe"
          value={inSyncCount === null || rows === null ? "…" : `${inSyncCount} / ${rows.length}`}
          hint={
            status.kind === "data"
              ? status.data.inSync
                ? "All target locales are in sync."
                : "At least one locale is out of sync."
              : "Loading sync state."
          }
        />
        <MetricCard label="Last run" icon="zap" value={lastRun.value} hint={lastRun.hint} />
      </div>
      {diff.kind === "loading" ? (
        <div className="mt-4">
          <Skeleton className="h-5 w-64" />
        </div>
      ) : null}
    </div>
  );
}
