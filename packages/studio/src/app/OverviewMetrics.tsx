import type { ReactNode } from "react";
import { averageCoverage, type StatusData } from "../client/coverage.js";
import { driftKeys, isFullyInSync } from "../client/diff-view.js";
import { routeHash } from "../client/routes.js";
import type { RefreshableView } from "../client/state.js";
import { MetricCard } from "./MetricCard.js";
import type { DiffState } from "./use-diff-state.js";

function attentionTile(diff: DiffState): {
  readonly value: string;
  readonly hint: string;
  readonly tone: "default" | "success" | "danger";
  readonly href?: string;
} {
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
  return {
    value: String(pending),
    hint: `${pending} ${pending === 1 ? "key" : "keys"} missing, changed or orphaned across ${drifting} of ${total} target ${total === 1 ? "locale" : "locales"}.`,
    tone: "danger",
    href: routeHash({
      page: "translations",
      params: { statuses: ["missing", "changed", "orphaned"] },
    }),
  };
}

export function OverviewMetrics({
  status,
  diff,
}: {
  readonly status: RefreshableView<StatusData>;
  readonly diff: DiffState;
}): ReactNode {
  const rows = status.kind === "data" ? status.data.rows : null;
  const attention = attentionTile(diff);
  const inSyncCount = rows === null ? null : rows.filter((row) => row.inSync).length;

  return (
    <div className="mb-10">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3">
        <MetricCard
          label="Needs attention"
          icon="alert"
          value={attention.value}
          hint={attention.hint}
          tone={attention.tone}
          {...(attention.href === undefined ? {} : { hintHref: attention.href })}
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
      </div>
    </div>
  );
}
