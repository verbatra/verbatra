import type { BudgetStanding } from "@verbatra/sdk";
import { Badge, type BadgeTone, Button, EmptyState, PageSection } from "@verbatra/ui";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { errorDetail } from "../../client/error-copy.js";
import { HISTORY_MAX, HISTORY_PAGE_SIZE } from "../../client/history-limit.js";
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
import { OverviewMetrics, type ReviewWaiting } from "../OverviewMetrics.js";
import { pageFailure } from "../overview-failures.js";
import { PageHeader } from "../PageHeader.js";
import type { PanelProps } from "../panel-props.js";
import { useDiffState } from "../use-diff-state.js";
import { type HistoryState, useHistoryList } from "../use-history-list.js";
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
      <div className="xs:col-span-2 lg:col-span-1">
        <MetricCard
          label="Budget"
          value={`${formatCount(budget.tokensUsed)} / ${formatCount(budget.maxTokens)}`}
          hint={`Behavior: ${budget.behavior}${counting}`}
          progress={budgetPercent(budget)}
          progressTone={budget.standing === "reached" ? "danger" : "primary"}
        />
      </div>
      <div className="xs:col-span-2 lg:col-span-1">
        <MetricCard label="Budget status" value={<Badge tone={badge.tone}>{badge.label}</Badge>} />
      </div>
    </>
  );
}

type UsageView = RefreshableView<UsageTickerData>;

const SEE_ABOVE = "See the error above.";

function LastRunRail({
  view,
  onRetry,
  hideCode,
}: {
  readonly view: UsageView;
  readonly onRetry: () => void;
  readonly hideCode: string | undefined;
}): ReactNode {
  if (view.kind === "loading") {
    return <Loading />;
  }
  if (view.kind === "error") {
    return view.error.code === hideCode ? (
      <p className="text-sm text-muted-foreground">The last run is unavailable. {SEE_ABOVE}</p>
    ) : (
      <ErrorMessage error={view.error} onRetry={onRetry} />
    );
  }

  const state = toUsageTickerDisplayState(view.data);
  const staleNotice =
    view.stale && view.error.code !== hideCode ? (
      <ErrorMessage error={view.error} prefix="Showing the last known usage." onRetry={onRetry} />
    ) : null;

  if (state.kind === "unavailable") {
    return (
      <div>
        {staleNotice}
        <EmptyState icon="gauge" title="No run recorded yet">
          Run <code>verbatra translate</code> or <code>verbatra watch</code> to record one.
        </EmptyState>
      </div>
    );
  }

  return (
    <div>
      {staleNotice}
      <p className="mb-3 text-xs text-muted-foreground">
        As of {formatTimestamp(state.generatedAt)}
      </p>
      <div className="grid grid-cols-1 gap-3 xs:grid-cols-2 lg:grid-cols-1">
        <UsageCards usage={state.usage} />
        <BudgetCards budget={state.budget} />
      </div>
    </div>
  );
}

function LocaleFileHistory({
  refreshToken,
  onRetry,
  hideCode,
}: {
  readonly refreshToken: number;
  readonly onRetry: () => void;
  readonly hideCode: string | undefined;
}): ReactNode {
  const [limit, setLimit] = useState(HISTORY_PAGE_SIZE);
  const history = useHistoryList(refreshToken, limit);
  const regionRef = useRef<HTMLDivElement>(null);
  const askedFrom = useRef<number | null>(null);
  const loaded = history.kind === "loaded";
  const failed = loaded && history.staleError !== undefined;
  const settled = loaded && !failed && history.requestedLimit === limit;
  const full = loaded && history.commits.length >= limit;
  const pending = loaded && !failed && !settled;
  const showMore = !failed && (pending || (full && limit < HISTORY_MAX));

  useEffect(() => {
    if (!settled || askedFrom.current === null) {
      return;
    }
    const firstNew = askedFrom.current;
    askedFrom.current = null;
    const rows = regionRef.current?.querySelectorAll<HTMLElement>('ul[aria-label="Commits"] > li');
    (rows?.[firstNew] ?? rows?.[rows.length - 1])?.focus();
  }, [settled]);

  function loadMore(): void {
    if (pending) {
      return;
    }
    askedFrom.current = loaded ? history.commits.length : 0;
    setLimit((current) => Math.min(current + HISTORY_PAGE_SIZE, HISTORY_MAX));
  }

  const hidden =
    (history.kind === "error" && history.error.code === hideCode) ||
    (history.kind === "loaded" && history.staleError?.code === hideCode);
  const shown: HistoryState =
    history.kind === "loaded" && hidden
      ? { kind: "loaded", commits: history.commits, requestedLimit: history.requestedLimit }
      : history;

  if (history.kind === "error" && hidden) {
    return (
      <p className="text-sm text-muted-foreground">File history is unavailable. {SEE_ABOVE}</p>
    );
  }

  return (
    <div ref={regionRef}>
      <CommitList
        state={shown}
        onRetry={onRetry}
        emptyMessage="No commit history yet for the source or target locale files."
      />
      {showMore ? (
        <div className="mt-4">
          <Button aria-disabled={pending} onClick={loadMore}>
            Show more commits
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export interface OverviewPanelProps extends PanelProps {
  readonly reviewWaiting?: ReviewWaiting | undefined;
}

export function OverviewPanel({ refreshToken, reviewWaiting }: OverviewPanelProps): ReactNode {
  const [retries, setRetries] = useState(0);
  const token = refreshToken + retries;
  const diff = useDiffState(token);
  const status = useStatusData(token);
  const lock = useLockState(token);
  const usage = useUsageTicker(token);
  const [retried, setRetried] = useState<readonly unknown[] | null>(null);
  const failure = pageFailure(diff, status, lock);
  const retrying =
    retried !== null && retried[0] === diff && retried[1] === status && retried[2] === lock;

  function retry(): void {
    setRetried([diff, status, lock]);
    setRetries((count) => count + 1);
  }

  return (
    <>
      <PageHeader
        title="Overview"
        description="How far along each locale is, what the last run did, and how the locale files have changed."
      />
      <OverviewMetrics status={status} diff={diff} reviewWaiting={reviewWaiting} />
      {failure === null ? null : (
        <ErrorMessage
          error={failure.error}
          detail={errorDetail(failure.error)}
          onRetry={retry}
          retrying={retrying}
          {...(failure.prefix === undefined ? {} : { prefix: failure.prefix })}
        />
      )}
      <DiffErrorNotice diff={diff} hideCode={failure?.error.code} />
      <LocalesSection status={status} lock={lock} hideCode={failure?.error.code} />
      <div className="grid gap-x-12 gap-y-10 lg:grid-cols-[minmax(0,1fr)_320px]">
        <PageSection title="Last run" className="mb-0 lg:col-start-2 lg:row-start-1">
          <LastRunRail view={usage} onRetry={retry} hideCode={failure?.error.code} />
        </PageSection>
        <PageSection title="Locale file history" className="mb-0 lg:col-start-1 lg:row-start-1">
          <LocaleFileHistory refreshToken={token} onRetry={retry} hideCode={failure?.error.code} />
        </PageSection>
      </div>
    </>
  );
}
