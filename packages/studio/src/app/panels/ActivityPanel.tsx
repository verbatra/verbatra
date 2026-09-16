import type { ReactNode } from "react";
import type { BudgetDisplay, UsageDisplay } from "../../client/usage-ticker-data.js";
import { budgetPercent, toUsageTickerDisplayState } from "../../client/usage-ticker-data.js";
import { Badge } from "../Badge.js";
import { CommitList } from "../CommitList.js";
import { ErrorMessage } from "../ErrorMessage.js";
import { Loading } from "../Loading.js";
import { MetricCard } from "../MetricCard.js";
import { PageHeader } from "../PageHeader.js";
import type { PanelProps } from "../panel-props.js";
import { EmptyState, PageSection } from "../ui.js";
import { useHistoryList } from "../use-history-list.js";
import { useUsageTicker } from "../use-usage-ticker.js";

function UsageCards({ usage }: { readonly usage: UsageDisplay }): ReactNode {
  if (usage.kind === "not-reported") {
    return (
      <MetricCard
        label="Tokens"
        icon="gauge"
        value="Not reported"
        hint="This provider does not report token usage."
      />
    );
  }
  return (
    <>
      <MetricCard label="Input tokens" icon="gauge" value={usage.inputTokens.toLocaleString()} />
      <MetricCard label="Output tokens" icon="gauge" value={usage.outputTokens.toLocaleString()} />
    </>
  );
}

function BudgetCards({ budget }: { readonly budget: BudgetDisplay }): ReactNode {
  if (budget.kind === "none") {
    return null;
  }
  const counting = budget.counting === "estimated" ? ", estimated" : "";
  return (
    <>
      <MetricCard
        label="Budget"
        value={`${budget.tokensUsed.toLocaleString()} / ${budget.maxTokens.toLocaleString()}`}
        hint={`Behavior: ${budget.behavior}${counting}`}
        progress={budgetPercent(budget)}
        progressTone={budget.exceeded ? "danger" : "primary"}
      />
      <MetricCard
        label="Budget status"
        value={
          <Badge tone={budget.exceeded ? "danger" : "success"}>
            {budget.exceeded ? "Ceiling reached" : "Within budget"}
          </Badge>
        }
      />
    </>
  );
}

function LastRunRail({ refreshToken }: PanelProps): ReactNode {
  const view = useUsageTicker(refreshToken);

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
        As of {new Date(state.generatedAt).toLocaleString()}
      </p>
      <div className="grid grid-cols-1 gap-3">
        <UsageCards usage={state.usage} />
        <BudgetCards budget={state.budget} />
      </div>
    </div>
  );
}

export function ActivityPanel({ refreshToken }: PanelProps): ReactNode {
  const history = useHistoryList(refreshToken);

  return (
    <>
      <PageHeader
        kicker="Reference"
        title="Activity"
        description="What the last run did, and how the locale files have changed."
      />
      <div className="grid gap-x-12 gap-y-10 lg:grid-cols-[minmax(0,1fr)_320px]">
        <PageSection title="Locale file history" className="mb-0 lg:col-start-1 lg:row-start-1">
          <CommitList
            state={history}
            emptyMessage="No commit history yet for the source or target locale files."
          />
        </PageSection>
        <PageSection title="Last run" className="mb-0 lg:col-start-2 lg:row-start-1">
          <LastRunRail refreshToken={refreshToken} />
        </PageSection>
      </div>
    </>
  );
}
