import type { BudgetStanding } from "@verbatra/sdk";
import { Badge, type BadgeTone, Button, EmptyState, PageSection } from "@verbatra/ui";
import type { ReactNode } from "react";
import { useState } from "react";
import type { RefreshableView } from "../../client/state.js";
import { formatCount, formatTimestamp } from "../../client/ui-format.js";
import type {
  BudgetDisplay,
  UsageDisplay,
  UsageTickerData,
} from "../../client/usage-ticker-data.js";
import { budgetPercent, toUsageTickerDisplayState } from "../../client/usage-ticker-data.js";
import { CommitList } from "../CommitList.js";
import { DiffErrorNotice } from "../DiffErrorNotice.js";
import { ErrorMessage } from "../ErrorMessage.js";
import { Loading } from "../Loading.js";
import { LocalesSection } from "../LocalesSection.js";
import { MetricCard } from "../MetricCard.js";
import { OverviewMetrics } from "../OverviewMetrics.js";
import { PageHeader } from "../PageHeader.js";
import type { PanelProps } from "../panel-props.js";
import { useDiffState } from "../use-diff-state.js";
import { useHistoryList } from "../use-history-list.js";
import { useLockState } from "../use-lock-state.js";
import { useStatusData } from "../use-status-data.js";
import { useUsageTicker } from "../use-usage-ticker.js";

function UsageCards({ usage }: { readonly usage: UsageDisplay }): ReactNode {
  if (usage.kind === "not-reported") {
    return (
      <MetricCard
        label="Tokens"
        icon="gauge"
        value="Not reported"
        quiet
        hint="No token usage was recorded: the run called no provider, or its provider does not report usage."
      />
    );
  }
  return (
    <>
      <MetricCard label="Input tokens" icon="gauge" value={formatCount(usage.inputTokens)} />
      <MetricCard label="Output tokens" icon="gauge" value={formatCount(usage.outputTokens)} />
    </>
  );
}

const STANDING_BADGE: Record<BudgetStanding, { readonly tone: BadgeTone; readonly label: string }> =
  {
    within: { tone: "success", label: "Within budget" },
    "stopped-before-ceiling": { tone: "warning", label: "Stopped before the ceiling" },
    reached: { tone: "danger", label: "Ceiling reached" },
  };

function BudgetCards({ budget }: { readonly budget: BudgetDisplay }): ReactNode {
  if (budget.kind === "none") {
    return null;
  }
  const counting = budget.counting === "estimated" ? ", estimated" : "";
  const badge = STANDING_BADGE[budget.standing];
  return (
    <>
      <MetricCard
        label="Budget"
        value={`${formatCount(budget.tokensUsed)} / ${formatCount(budget.maxTokens)}`}
        hint={`Behavior: ${budget.behavior}${counting}`}
        progress={budgetPercent(budget)}
        progressTone={budget.standing === "reached" ? "danger" : "primary"}
      />
      <MetricCard label="Budget status" value={<Badge tone={badge.tone}>{badge.label}</Badge>} />
    </>
  );
}

type UsageView = RefreshableView<UsageTickerData>;

function LastRunRail({ view }: { readonly view: UsageView }): ReactNode {
  if (view.kind === "loading") {
    return <Loading />;
  }
  if (view.kind === "error") {
    return <ErrorMessage error={view.error} />;
  }

  const state = toUsageTickerDisplayState(view.data);

  if (state.kind === "unavailable") {
    return (
      <EmptyState icon="gauge" title="No run recorded yet">
        Run <code>verbatra translate</code> or <code>verbatra watch</code> to record one.
      </EmptyState>
    );
  }

  return (
    <div>
      {view.stale && <ErrorMessage error={view.error} prefix="Showing the last known usage." />}
      <p className="mb-3 text-xs text-muted-foreground">
        As of {formatTimestamp(state.generatedAt)}
      </p>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
        <UsageCards usage={state.usage} />
        <BudgetCards budget={state.budget} />
      </div>
    </div>
  );
}

const HISTORY_PAGE_SIZE = 10;
const HISTORY_MAX = 200;

function LocaleFileHistory({ refreshToken }: PanelProps): ReactNode {
  const [limit, setLimit] = useState(HISTORY_PAGE_SIZE);
  const history = useHistoryList(refreshToken, limit);
  const mayHaveMore =
    history.kind === "loaded" && history.commits.length >= limit && limit < HISTORY_MAX;

  return (
    <>
      <CommitList
        state={history}
        emptyMessage="No commit history yet for the source or target locale files."
      />
      {mayHaveMore ? (
        <div className="mt-4">
          <Button onClick={() => setLimit((current) => current + HISTORY_PAGE_SIZE)}>
            Show more commits
          </Button>
        </div>
      ) : null}
    </>
  );
}

export function OverviewPanel({ refreshToken }: PanelProps): ReactNode {
  const diff = useDiffState(refreshToken);
  const status = useStatusData(refreshToken);
  const lock = useLockState(refreshToken);
  const usage = useUsageTicker(refreshToken);

  return (
    <>
      <PageHeader
        title="Overview"
        description="How far along each locale is, what the last run did, and how the locale files have changed."
      />
      <OverviewMetrics status={status} diff={diff} />
      <DiffErrorNotice diff={diff} />
      <LocalesSection status={status} lock={lock} />
      <div className="grid gap-x-12 gap-y-10 lg:grid-cols-[minmax(0,1fr)_320px]">
        <PageSection title="Last run" className="mb-0 lg:col-start-2 lg:row-start-1">
          <LastRunRail view={usage} />
        </PageSection>
        <PageSection title="Locale file history" className="mb-0 lg:col-start-1 lg:row-start-1">
          <LocaleFileHistory refreshToken={refreshToken} />
        </PageSection>
      </div>
    </>
  );
}
