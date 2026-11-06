import type { BudgetStanding } from "@verbatra/sdk";
import { Badge, type BadgeTone, Button, EmptyState, PageSection } from "@verbatra/ui";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { errorDetail } from "../../client/error-copy.js";
import { HISTORY_MAX, HISTORY_PAGE_SIZE } from "../../client/history-limit.js";
import type { ReviewQueueData } from "../../client/review-queue-data.js";
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
      <div className="sm:col-span-2 lg:col-span-1">
        <MetricCard
          label="Tokens"
          icon="gauge"
          value="Not reported"
          quiet
          hint="No token usage was recorded: the run called no provider, or its provider does not report usage."
        />
      </div>
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
      <div className="sm:col-span-2 lg:col-span-1">
        <MetricCard
          label="Budget"
          value={`${formatCount(budget.tokensUsed)} / ${formatCount(budget.maxTokens)}`}
          hint={`Behavior: ${budget.behavior}${counting}`}
          progress={budgetPercent(budget)}
          progressTone={budget.standing === "reached" ? "danger" : "primary"}
        />
      </div>
      <div className="sm:col-span-2 lg:col-span-1">
        <MetricCard label="Budget status" value={<Badge tone={badge.tone}>{badge.label}</Badge>} />
      </div>
    </>
  );
}

type UsageView = RefreshableView<UsageTickerData>;

const SEE_ABOVE = "See the error above.";

function LastRunRail({
  view,
  hideCode,
}: {
  readonly view: UsageView;
  readonly hideCode: string | undefined;
}): ReactNode {
  if (view.kind === "loading") {
    return <Loading />;
  }
  if (view.kind === "error") {
    return view.error.code === hideCode ? (
      <p className="text-sm text-muted-foreground">The last run is unavailable. {SEE_ABOVE}</p>
    ) : (
      <ErrorMessage error={view.error} />
    );
  }

  const state = toUsageTickerDisplayState(view.data);
  const staleNotice =
    view.stale && view.error.code !== hideCode ? (
      <ErrorMessage error={view.error} prefix="Showing the last known usage." />
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
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1">
        <UsageCards usage={state.usage} />
        <BudgetCards budget={state.budget} />
      </div>
    </div>
  );
}

function withoutRepeatedNotice(
  history: HistoryState,
  hideCode: string | undefined,
): { readonly hidden: boolean; readonly shown: HistoryState } {
  if (history.kind === "error") {
    return { hidden: history.error.code === hideCode, shown: history };
  }
  if (
    history.kind === "loaded" &&
    history.staleError !== undefined &&
    history.staleError.code === hideCode
  ) {
    return {
      hidden: true,
      shown: { kind: "loaded", commits: history.commits, requestedLimit: history.requestedLimit },
    };
  }
  return { hidden: false, shown: history };
}

function LocaleFileHistory({
  history,
  limit,
  onLimit,
  hideCode,
}: {
  readonly history: HistoryState;
  readonly limit: number;
  readonly onLimit: (next: number) => void;
  readonly hideCode: string | undefined;
}): ReactNode {
  const regionRef = useRef<HTMLDivElement>(null);
  const askedFrom = useRef<number | null>(null);
  const loaded = history.kind === "loaded";
  const commitCount = loaded ? history.commits.length : 0;
  const failed = loaded && history.staleError !== undefined;
  const settled = loaded && !failed && history.requestedLimit === limit;
  const full = loaded && history.commits.length >= limit;
  const pending = loaded && !failed && !settled;
  const showMore = !failed && (pending || (full && limit < HISTORY_MAX));

  useEffect(() => {
    if (failed) {
      askedFrom.current = null;
      return;
    }
    if (!settled || askedFrom.current === null) {
      return;
    }
    const firstNew = askedFrom.current;
    askedFrom.current = null;
    const rows = [
      ...(regionRef.current?.querySelectorAll<HTMLElement>('ul[aria-label="Commits"] > li') ?? []),
    ];
    (rows[firstNew] ?? rows.at(-1))?.focus();
  }, [failed, settled]);

  function loadMore(): void {
    if (pending) {
      return;
    }
    askedFrom.current = commitCount;
    onLimit(Math.min(limit + HISTORY_PAGE_SIZE, HISTORY_MAX));
  }

  const { hidden, shown } = withoutRepeatedNotice(history, hideCode);

  if (history.kind === "error" && hidden) {
    return (
      <p className="text-sm text-muted-foreground">File history is unavailable. {SEE_ABOVE}</p>
    );
  }

  return (
    <div ref={regionRef}>
      <CommitList
        state={shown}
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
  readonly reviewQueue?: RefreshableView<ReviewQueueData> | undefined;
  readonly onRetry?: (() => void) | undefined;
}

export function OverviewPanel({
  refreshToken,
  reviewQueue,
  onRetry,
}: OverviewPanelProps): ReactNode {
  const [localRetries, setLocalRetries] = useState(0);
  const token = refreshToken + localRetries;
  const [limit, setLimit] = useState(HISTORY_PAGE_SIZE);
  const diff = useDiffState(token);
  const status = useStatusData(token);
  const lock = useLockState(token);
  const usage = useUsageTicker(token);
  const history = useHistoryList(token, limit);
  const [retried, setRetried] = useState<readonly unknown[] | null>(null);
  const recoveryRef = useRef<HTMLDivElement>(null);
  const awaitingRecovery = useRef(false);
  const failure = pageFailure({ diff, status, lock, review: reviewQueue, usage, history });
  const reads = [diff, status, lock, reviewQueue, usage, history];
  const retrying = retried?.every((read, index) => read === reads[index]) === true;
  const settled =
    retried !== null && reads.every((read, index) => read === undefined || read !== retried[index]);

  useEffect(() => {
    if (!settled || !awaitingRecovery.current) {
      return;
    }
    awaitingRecovery.current = false;
    const lostFocus = document.activeElement === document.body || document.activeElement === null;
    if (failure === null && lostFocus) {
      recoveryRef.current?.focus();
    }
  }, [settled, failure]);

  function retry(): void {
    awaitingRecovery.current = true;
    setRetried(reads);
    if (onRetry === undefined) {
      setLocalRetries((count) => count + 1);
    } else {
      onRetry();
    }
  }

  return (
    <>
      <PageHeader
        title="Overview"
        description="How far along each locale is, what the last run did, and how the locale files have changed."
      />
      <div
        ref={recoveryRef}
        tabIndex={-1}
        data-overview-recovery=""
        className="rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <OverviewMetrics status={status} diff={diff} reviewQueue={reviewQueue} />
      </div>
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
          <LastRunRail view={usage} hideCode={failure?.error.code} />
        </PageSection>
        <PageSection title="Locale file history" className="mb-0 lg:col-start-1 lg:row-start-1">
          <LocaleFileHistory
            history={history}
            limit={limit}
            onLimit={setLimit}
            hideCode={failure?.error.code}
          />
        </PageSection>
      </div>
    </>
  );
}
