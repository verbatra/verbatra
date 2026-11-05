import { Button, EmptyState, TableSkeleton } from "@verbatra/ui";
import type { ReactNode, RefObject } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { localeValuesOrEmpty, valuesIndex } from "../../client/locale-values.js";
import { canRetranslateReviewed } from "../../client/retranslate-eligibility.js";
import {
  filterReviewRows,
  REVIEW_ORIGIN_LABELS,
  reviewStateCounts,
  uniqueReviewLocales,
} from "../../client/review-filter.js";
import {
  elapsedSeconds,
  hasRunningRetranslation,
  type PendingRow,
} from "../../client/review-in-flight.js";
import type { QueueReviewState, ReviewQueueRow } from "../../client/review-queue-data.js";
import {
  flattenReviewQueue,
  reviewedSourceFor,
  reviewedValueFor,
} from "../../client/review-queue-data.js";
import { routeParams } from "../../client/routes.js";
import type { StudioCapabilities } from "../../shared/rpc/snapshot.js";
import { ApproveLocaleDialog } from "../ApproveLocaleDialog.js";
import { ErrorMessage } from "../ErrorMessage.js";
import { PageHeader } from "../PageHeader.js";
import type { PanelProps } from "../panel-props.js";
import { ReviewBulkBar } from "../ReviewBulkBar.js";
import { ReviewDecisionStatus } from "../ReviewDecisionStatus.js";
import { type EditingTarget, type RejectingTarget, ReviewDialogs } from "../ReviewDialogs.js";
import {
  ALL_FACETS,
  type ApproveAllAction,
  isDefaultFacets,
  isReviewDone,
  type ReviewFacets,
  ReviewFilterBar,
} from "../ReviewFilterBar.js";
import type { RowBusy } from "../ReviewRowActions.js";
import { ReviewTable, type RowActions } from "../ReviewTable.js";
import { type BulkSelection, useBulkSelection } from "../use-bulk-selection.js";
import { useCapabilities } from "../use-capabilities.js";
import { useLocaleValues } from "../use-locale-values.js";
import { useNow } from "../use-now.js";
import { rowId, useReviewDecisions } from "../use-review-decisions.js";
import {
  handleShortcut,
  useActiveRow,
  useReviewShortcuts,
  useSettledFocus,
} from "../use-review-keyboard.js";
import { useReviewQueue } from "../use-review-queue.js";
import { useRouteParams } from "../use-route.js";

export function ReviewPanel({ refreshToken }: PanelProps): ReactNode {
  return (
    <>
      <PageHeader
        title="Review"
        description="Every translation a provider, the translation memory, or an agent wrote that nobody has approved yet, read from the committed files. Decisions are saved to verbatra.provenance.json; commit it to share them with your team."
      />
      <ReviewPanelBody refreshToken={refreshToken} />
    </>
  );
}

function AllClear({
  clearRef,
  action,
  children,
}: {
  readonly clearRef: RefObject<HTMLDivElement | null>;
  readonly action?: ReactNode;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <div
      ref={clearRef}
      tabIndex={-1}
      data-all-clear=""
      className="rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <EmptyState icon="review" title="All clear" action={action}>
        {children}
      </EmptyState>
    </div>
  );
}

function ReviewQueueContent({
  rows,
  filtered,
  stateCounts,
  facets,
  query,
  onFacetsChange,
  onQueryChange,
  onShowShortcuts,
  bulk,
  capabilities,
  actions,
  approveAll,
  clearRef,
}: {
  readonly rows: readonly ReviewQueueRow[];
  readonly filtered: readonly ReviewQueueRow[];
  readonly stateCounts: Readonly<Record<QueueReviewState, number>>;
  readonly facets: ReviewFacets;
  readonly query: string;
  readonly onFacetsChange: (facets: ReviewFacets) => void;
  readonly onQueryChange: (query: string) => void;
  readonly onShowShortcuts: () => void;
  readonly bulk: BulkSelection;
  readonly capabilities: StudioCapabilities | undefined;
  readonly actions: RowActions;
  readonly approveAll: ApproveAllAction | undefined;
  readonly clearRef: RefObject<HTMLDivElement | null>;
}): ReactNode {
  const searchRef = useRef<HTMLInputElement | null>(null);
  if (rows.length === 0) {
    return <AllClear clearRef={clearRef}>Nothing to review right now.</AllClear>;
  }
  return (
    <>
      <ReviewFilterBar
        locales={uniqueReviewLocales(rows)}
        facets={facets}
        query={query}
        onFacetsChange={onFacetsChange}
        onQueryChange={(event) => onQueryChange(event.target.value)}
        onShowShortcuts={onShowShortcuts}
        matchCount={filtered.length}
        stateCounts={stateCounts}
        searchRef={searchRef}
        approveAll={approveAll}
      />
      {capabilities?.writeToDisk === true ? (
        <ReviewBulkBar {...bulk.bar} approveDisabled={facets.reviewState === "approved"} />
      ) : null}
      {filtered.length === 0 && isReviewDone(facets, query) ? (
        <AllClear
          clearRef={clearRef}
          action={
            isDefaultFacets(facets, query) ? undefined : (
              <Button
                onClick={() => {
                  onFacetsChange(ALL_FACETS);
                  onQueryChange("");
                  searchRef.current?.focus();
                }}
              >
                Clear filters
              </Button>
            )
          }
        >
          Nothing to review right now. Choose Approved to see what was decided.
        </AllClear>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="search"
          title="No matching entries"
          action={
            <Button
              onClick={() => {
                onFacetsChange(ALL_FACETS);
                onQueryChange("");
                searchRef.current?.focus();
              }}
            >
              Clear filters
            </Button>
          }
        >
          No entry matches the current filters.
        </EmptyState>
      ) : (
        <ReviewTable
          rows={filtered}
          capabilities={capabilities}
          actions={actions}
          selection={bulk.state}
          onSelectAll={bulk.setAll}
        />
      )}
    </>
  );
}

function busyFor(
  pending: ReadonlyMap<string, PendingRow>,
  now: number,
): (row: ReviewQueueRow) => RowBusy | undefined {
  return (row) => {
    const busy = pending.get(rowId(row));
    if (busy === undefined) {
      return undefined;
    }
    return busy.action === "retranslate"
      ? { action: busy.action, elapsedSeconds: elapsedSeconds(busy.startedAt, now) }
      : { action: busy.action };
  };
}

function approveAllFor(
  facets: ReviewFacets,
  count: number,
  canWrite: boolean,
  open: (action: ApproveAllAction) => void,
): ApproveAllAction | undefined {
  if (!canWrite || facets.reviewState !== "unreviewed" || facets.locale === "" || count === 0) {
    return undefined;
  }
  const action: ApproveAllAction = {
    locale: facets.locale,
    count,
    onClick: () => open(action),
  };
  return action;
}

function knownReviewLocale(locale: string | undefined, rows: readonly ReviewQueueRow[]): string {
  if (locale === undefined) {
    return "";
  }
  return rows.length === 0 || uniqueReviewLocales(rows).includes(locale) ? locale : "";
}

function ReviewPanelBody({ refreshToken }: PanelProps): ReactNode {
  const [reloadToken, setReloadToken] = useState(0);
  const view = useReviewQueue(refreshToken, reloadToken);
  const capabilitiesState = useCapabilities();
  const capabilities =
    capabilitiesState.kind === "loaded" ? capabilitiesState.capabilities : undefined;
  const spend = canRetranslateReviewed(capabilities);
  const [editing, setEditing] = useState<EditingTarget | null>(null);
  const [rejecting, setRejecting] = useState<RejectingTarget | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [params, setParams] = useRouteParams("review");
  const [localFacets, setLocalFacets] = useState<Omit<ReviewFacets, "locale">>({
    origin: ALL_FACETS.origin,
    reviewState: ALL_FACETS.reviewState,
  });
  const [query, setQuery] = useState("");
  const [approvingLocale, setApprovingLocale] = useState<ApproveAllAction | null>(null);
  const localeValues = localeValuesOrEmpty(useLocaleValues(refreshToken, reloadToken));
  const values = useMemo(() => valuesIndex(localeValues), [localeValues]);
  const decisions = useReviewDecisions(() => setReloadToken((current) => current + 1), {
    trackServer: spend,
    refreshToken,
    limits: capabilities?.limits,
  });
  const now = useNow(hasRunningRetranslation(decisions.pending));
  const settleReload = decisions.reloaded;
  useEffect(() => {
    if (view.kind === "data") {
      settleReload();
    }
  }, [view, settleReload]);

  const rows = view.kind === "data" ? flattenReviewQueue(view.data) : [];
  const urlLocale = knownReviewLocale(params.locale, rows);
  const facets: ReviewFacets = { ...localFacets, locale: urlLocale };
  useEffect(() => {
    if (params.locale !== undefined && urlLocale === "") {
      setParams(routeParams({}));
    }
  }, [params.locale, urlLocale, setParams]);
  const setFacets = (next: ReviewFacets): void => {
    setLocalFacets({ origin: next.origin, reviewState: next.reviewState });
    if (next.locale !== urlLocale) {
      setParams(routeParams({ locale: next.locale }));
    }
  };
  const filterOf = (search: string) => ({
    locale: facets.locale === "" ? null : facets.locale,
    query: search,
    origin: facets.origin === "" ? null : facets.origin,
    reviewState: facets.reviewState,
  });
  const filtered = filterReviewRows(rows, filterOf(query), values);
  const stateCounts = reviewStateCounts(rows, filterOf(query), values);
  const approveAll = approveAllFor(
    facets,
    filterReviewRows(rows, filterOf("")).length,
    capabilities?.writeToDisk === true,
    setApprovingLocale,
  );
  const clearRef = useRef<HTMLDivElement | null>(null);
  const active = useActiveRow(filtered);
  const settledFocus = useSettledFocus(
    view.kind === "data" &&
      !decisions.awaitingReload() &&
      editing === null &&
      rejecting === null &&
      approvingLocale === null,
    () => {
      if (filtered.length > 0) {
        active.focusActive();
      } else {
        clearRef.current?.focus();
      }
    },
  );
  const settledCount = decisions.settledCount;
  const requestFocus = settledFocus.request;
  const lastSettled = useRef(settledCount);
  useEffect(() => {
    if (settledCount !== lastSettled.current) {
      lastSettled.current = settledCount;
      requestFocus();
    }
  }, [settledCount, requestFocus]);
  const bulk = useBulkSelection(filtered, values, decisions, spend, requestFocus);
  const actions: RowActions = {
    onEdit: (row, viaShortcut) =>
      setEditing({ locale: row.locale, key: row.key, reasons: row.reasons, viaShortcut }),
    onApprove: decisions.approve,
    onReject: setRejecting,
    onRetranslate: spend ? decisions.retranslate : undefined,
    onActivate: active.activate,
    currentValueOf: (row) => reviewedValueFor(values, row),
    sourceOf: (row) => reviewedSourceFor(values, row),
    sourceLocale: capabilitiesState.kind === "loaded" ? capabilitiesState.sourceLocale : undefined,
    busyOf: busyFor(decisions.pending, now),
    activeId: active.activeRow === undefined ? null : rowId(active.activeRow),
    rowRefs: active.rowRefs,
    selected: bulk.selected,
    onToggleSelected: bulk.toggle,
  };

  useReviewShortcuts(
    editing === null && rejecting === null && bulk.rejecting === null && approvingLocale === null,
    (action) =>
      handleShortcut(action, {
        helpOpen,
        setHelpOpen,
        active,
        canWrite: capabilities?.writeToDisk === true,
        actions,
        toggleSelected: bulk.toggle,
      }),
  );

  if (view.kind === "loading") {
    return (
      <div role="status">
        <span className="sr-only">Loading review queue…</span>
        <TableSkeleton />
      </div>
    );
  }
  if (view.kind === "error") {
    return <ErrorMessage error={view.error} />;
  }
  if (!view.data.available) {
    return (
      <EmptyState icon="review" title="Review state cannot be read">
        <code>verbatra.provenance.json</code> is corrupt or was written by a newer verbatra. Restore
        it from version control or upgrade verbatra.
      </EmptyState>
    );
  }

  return (
    <div>
      {view.stale && <ErrorMessage error={view.error} prefix="Showing the last known queue." />}
      <ReviewDecisionStatus notice={decisions.notice} />
      <ReviewQueueContent
        rows={rows}
        filtered={filtered}
        stateCounts={stateCounts}
        facets={facets}
        query={query}
        onFacetsChange={setFacets}
        onQueryChange={setQuery}
        onShowShortcuts={() => setHelpOpen(true)}
        bulk={bulk}
        capabilities={capabilities}
        actions={actions}
        approveAll={approveAll}
        clearRef={clearRef}
      />
      {approvingLocale !== null ? (
        <ApproveLocaleDialog
          locale={approvingLocale.locale}
          count={approvingLocale.count}
          originLabel={facets.origin === "" ? null : REVIEW_ORIGIN_LABELS[facets.origin]}
          onConfirm={(settled) =>
            decisions.approveLocale(
              approvingLocale.locale,
              facets.origin === "" ? undefined : [facets.origin],
              settled,
            )
          }
          onClose={() => setApprovingLocale(null)}
        />
      ) : null}
      <ReviewDialogs
        helpOpen={helpOpen}
        spend={spend}
        editing={editing}
        rejecting={rejecting}
        decisions={decisions}
        onCloseHelp={() => setHelpOpen(false)}
        onCloseEditor={() => setEditing(null)}
        onCloseReject={() => setRejecting(null)}
        bulkRejecting={bulk.rejecting}
        onConfirmBulkReject={bulk.confirmReject}
        onCloseBulkReject={bulk.closeReject}
      />
    </div>
  );
}
