import type { MachineClassOrigin } from "@verbatra/sdk";
import { Button, EmptyState, FilterBar, SearchInput, Select, TableSkeleton } from "@verbatra/ui";
import type { ChangeEvent, ReactNode, Ref } from "react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { KeyValuePair } from "../../client/filter.js";
import { localeValuesOrEmpty, valuesIndex } from "../../client/locale-values.js";
import { canRetranslateReviewed } from "../../client/retranslate-eligibility.js";
import {
  filterReviewRows,
  REVIEW_ORIGIN_LABELS,
  REVIEW_STATE_LABELS,
  uniqueReviewLocales,
} from "../../client/review-filter.js";
import {
  elapsedSeconds,
  hasRunningRetranslation,
  type PendingRow,
  type RowBusyAction,
} from "../../client/review-in-flight.js";
import type { QueueReviewState, ReviewQueueRow } from "../../client/review-queue-data.js";
import {
  flattenReviewQueue,
  reviewedSourceFor,
  reviewedValueFor,
} from "../../client/review-queue-data.js";
import {
  bulkBusyNote,
  bulkDecisionBlocker,
  bulkRetranslateBlocker,
  type SelectionState,
  selectedAmong,
  selectionState,
  toggleSelected,
  withAllSelected,
} from "../../client/review-selection.js";
import {
  clampIndex,
  classifyShortcutTarget,
  type ReviewShortcutAction,
  resolveReviewShortcut,
  type ShortcutTargetShape,
  shortcutKeysFor,
  stepIndex,
} from "../../client/review-shortcuts.js";
import { routeParams } from "../../client/routes.js";
import { MAX_RETRANSLATE_BATCH_ENTRIES } from "../../shared/rpc/retranslate-entries.js";
import { MAX_REVIEW_BATCH_ENTRIES } from "../../shared/rpc/review-batch.js";
import type { StudioCapabilities } from "../../shared/rpc/snapshot.js";
import { ApproveLocaleDialog } from "../ApproveLocaleDialog.js";
import type { BulkRejectEntry } from "../BulkRejectDialog.js";
import { ErrorMessage } from "../ErrorMessage.js";
import { PageHeader } from "../PageHeader.js";
import type { PanelProps } from "../panel-props.js";
import { ReviewBulkBar, type ReviewBulkBarProps } from "../ReviewBulkBar.js";
import { ReviewDecisionStatus } from "../ReviewDecisionStatus.js";
import { type EditingTarget, type RejectingTarget, ReviewDialogs } from "../ReviewDialogs.js";
import type { RowBusy } from "../ReviewRowActions.js";
import { ReviewTable, type RowActions } from "../ReviewTable.js";
import { useCapabilities } from "../use-capabilities.js";
import { useLocaleValues } from "../use-locale-values.js";
import { useNow } from "../use-now.js";
import {
  type BatchSettled,
  type ReviewDecisions,
  rowId,
  useReviewDecisions,
} from "../use-review-decisions.js";
import { useReviewQueue } from "../use-review-queue.js";
import { useRouteParams } from "../use-route.js";

export interface ReviewFacets {
  readonly locale: string;
  readonly origin: MachineClassOrigin | "";
  readonly reviewState: QueueReviewState;
}

const ALL_FACETS: ReviewFacets = { locale: "", origin: "", reviewState: "unreviewed" };

const ORIGIN_OPTIONS = Object.keys(REVIEW_ORIGIN_LABELS) as readonly MachineClassOrigin[];

const STATE_OPTIONS = Object.keys(REVIEW_STATE_LABELS) as readonly QueueReviewState[];

function isOrigin(value: string): value is MachineClassOrigin {
  return (ORIGIN_OPTIONS as readonly string[]).includes(value);
}

function FacetSelects({
  locales,
  facets,
  onFacetsChange,
}: {
  readonly locales: readonly string[];
  readonly facets: ReviewFacets;
  readonly onFacetsChange: (facets: ReviewFacets) => void;
}): ReactNode {
  return (
    <>
      <Select
        aria-label="Filter by review state"
        value={facets.reviewState}
        onChange={(event) =>
          onFacetsChange({
            ...facets,
            reviewState: event.target.value === "approved" ? "approved" : "unreviewed",
          })
        }
      >
        {STATE_OPTIONS.map((state) => (
          <option key={state} value={state}>
            {REVIEW_STATE_LABELS[state]}
          </option>
        ))}
      </Select>
      <Select
        aria-label="Filter by locale"
        value={facets.locale}
        onChange={(event) => onFacetsChange({ ...facets, locale: event.target.value })}
      >
        <option value="">All locales</option>
        {locales.map((code) => (
          <option key={code} value={code}>
            {code}
          </option>
        ))}
      </Select>
      <Select
        aria-label="Filter by origin"
        value={facets.origin}
        onChange={(event) =>
          onFacetsChange({
            ...facets,
            origin: isOrigin(event.target.value) ? event.target.value : "",
          })
        }
      >
        <option value="">All origins</option>
        {ORIGIN_OPTIONS.map((origin) => (
          <option key={origin} value={origin}>
            {REVIEW_ORIGIN_LABELS[origin]}
          </option>
        ))}
      </Select>
    </>
  );
}

export interface ApproveAllAction {
  readonly locale: string;
  readonly count: number;
  readonly onClick: () => void;
}

function ReviewFilterBar({
  locales,
  facets,
  query,
  onFacetsChange,
  onQueryChange,
  onShowShortcuts,
  matchCount,
  searchRef,
  approveAll,
}: {
  readonly locales: readonly string[];
  readonly facets: ReviewFacets;
  readonly query: string;
  readonly onFacetsChange: (facets: ReviewFacets) => void;
  readonly onQueryChange: (event: ChangeEvent<HTMLInputElement>) => void;
  readonly onShowShortcuts: () => void;
  readonly matchCount: number;
  readonly searchRef: Ref<HTMLInputElement>;
  readonly approveAll: ApproveAllAction | undefined;
}): ReactNode {
  return (
    <FilterBar label="Review queue filters">
      <FacetSelects locales={locales} facets={facets} onFacetsChange={onFacetsChange} />
      <SearchInput
        ref={searchRef}
        aria-label="Filter by key or translation text"
        placeholder="Filter by key or text…"
        value={query}
        onChange={onQueryChange}
      />
      <span className="text-sm text-muted-foreground">
        {matchCount} {matchCount === 1 ? "entry" : "entries"}
      </span>
      {approveAll !== undefined ? (
        <Button variant="secondary-success" onClick={approveAll.onClick} data-approve-locale="">
          Approve all in {approveAll.locale} ({approveAll.count})…
        </Button>
      ) : null}
      <Button
        variant="ghost"
        className="ms-auto"
        onClick={onShowShortcuts}
        aria-keyshortcuts={shortcutKeysFor("help")}
      >
        Keyboard shortcuts
        <kbd className="rounded-sm border border-border bg-muted px-1 font-mono text-xs text-muted-foreground">
          ?
        </kbd>
      </Button>
    </FilterBar>
  );
}

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

interface ActiveRow {
  readonly activeRow: ReviewQueueRow | undefined;
  readonly rowRefs: Map<string, HTMLTableRowElement>;
  readonly activate: (row: ReviewQueueRow) => void;
  readonly move: (delta: number) => void;
  readonly focusActive: () => void;
}

function resolveActiveIndex(
  rows: readonly ReviewQueueRow[],
  active: { readonly id: string; readonly index: number } | null,
): number {
  if (active === null || rows.length === 0) {
    return -1;
  }
  const found = rows.findIndex((row) => rowId(row) === active.id);
  return found >= 0 ? found : clampIndex(active.index, rows.length);
}

function useActiveRow(rows: readonly ReviewQueueRow[]): ActiveRow {
  const [active, setActive] = useState<{ readonly id: string; readonly index: number } | null>(
    null,
  );
  const rowRefs = useRef(new Map<string, HTMLTableRowElement>()).current;
  const index = resolveActiveIndex(rows, active);
  const activeRow = rows[index];

  function select(next: number): ReviewQueueRow | undefined {
    const row = rows[next];
    if (row !== undefined) {
      setActive({ id: rowId(row), index: next });
    }
    return row;
  }

  return {
    activeRow,
    rowRefs,
    activate: (row) => {
      select(rows.indexOf(row));
    },
    move: (delta) => {
      const row = select(activeRow === undefined ? 0 : stepIndex(index, delta, rows.length));
      if (row !== undefined) {
        rowRefs.get(rowId(row))?.focus();
      }
    },
    focusActive: () => {
      const row = activeRow ?? rows[0];
      if (row !== undefined) {
        rowRefs.get(rowId(row))?.focus();
      }
    },
  };
}

function shortcutTargetOf(target: EventTarget | null): ShortcutTargetShape | null {
  if (!(target instanceof HTMLElement)) {
    return null;
  }
  return {
    tagName: target.tagName,
    type: target.getAttribute("type") ?? "",
    isContentEditable: target.isContentEditable === true,
  };
}

function useReviewShortcuts(
  enabled: boolean,
  onAction: (action: ReviewShortcutAction) => void,
): void {
  const handler = useRef(onAction);
  useLayoutEffect(() => {
    handler.current = onAction;
  });
  useEffect(() => {
    if (!enabled) {
      return;
    }
    function onKeyDown(event: KeyboardEvent): void {
      const action = resolveReviewShortcut({
        key: event.key,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        altKey: event.altKey,
        target: classifyShortcutTarget(shortcutTargetOf(event.target)),
      });
      if (action === null) {
        return;
      }
      event.preventDefault();
      handler.current(action);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [enabled]);
}

function runRowShortcut(
  action: Exclude<ReviewShortcutAction, "next" | "previous" | "help" | "select">,
  row: ReviewQueueRow,
  actions: RowActions,
): void {
  if (
    actions.busyOf(row) !== undefined ||
    (action === "approve" && row.reviewState === "approved")
  ) {
    return;
  }
  const value = actions.currentValueOf(row);
  if (action === "edit") {
    actions.onEdit(row, true);
  } else if (action === "retranslate") {
    actions.onRetranslate?.(row);
  } else if (value !== undefined && action === "approve") {
    actions.onApprove(row, value);
  } else if (value !== undefined) {
    actions.onReject({ locale: row.locale, key: row.key, value });
  }
}

interface BulkSelection {
  readonly selected: ReadonlySet<string>;
  readonly state: SelectionState;
  readonly toggle: (row: ReviewQueueRow) => void;
  readonly setAll: (on: boolean) => void;
  readonly bar: ReviewBulkBarProps;
  readonly rejecting: readonly BulkRejectEntry[] | null;
  readonly confirmReject: (entries: readonly BulkRejectEntry[]) => void;
  readonly closeReject: () => void;
}

function bulkTargetsOf(
  rows: readonly ReviewQueueRow[],
  values: ReadonlyMap<string, KeyValuePair>,
): readonly BulkRejectEntry[] {
  return rows.flatMap((row) => {
    const value = reviewedValueFor(values, row);
    return value === undefined ? [] : [{ locale: row.locale, key: row.key, value }];
  });
}

function useBulkSelection(
  rows: readonly ReviewQueueRow[],
  values: ReadonlyMap<string, KeyValuePair>,
  decisions: ReviewDecisions,
  spend: boolean,
  onCleared: () => void,
): BulkSelection {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [rejecting, setRejecting] = useState<readonly BulkRejectEntry[] | null>(null);
  const [running, setRunning] = useState<RowBusyAction | undefined>(undefined);
  const ids = rows.map(rowId);
  const selectedIds = new Set(selectedAmong(ids, selected));
  const selectedRows = rows.filter((row) => selectedIds.has(rowId(row)));
  const actionableRows = selectedRows.filter((row) => !decisions.pending.has(rowId(row)));
  const targets = bulkTargetsOf(actionableRows, values);
  const keepFailures: BatchSettled = (failed) => {
    setRunning(undefined);
    setSelected((current) => new Set([...current].filter((id) => failed.has(id))));
  };
  return {
    selected,
    state: selectionState(ids, selected),
    toggle: (row) => setSelected((current) => toggleSelected(current, rowId(row))),
    setAll: (on) => setSelected((current) => withAllSelected(current, ids, on)),
    bar: {
      count: selectedRows.length,
      actionable: actionableRows.length,
      busyAction: running,
      busyNote:
        running === undefined ? bulkBusyNote(selectedRows.length - actionableRows.length) : null,
      decisionBlocker: bulkDecisionBlocker(
        actionableRows.length,
        targets.length,
        MAX_REVIEW_BATCH_ENTRIES,
      ),
      retranslateBlocker: bulkRetranslateBlocker(
        actionableRows.length,
        MAX_RETRANSLATE_BATCH_ENTRIES,
      ),
      onApprove: () => {
        setRunning("approve");
        decisions.approveMany(targets, keepFailures);
      },
      onReject: () => setRejecting(targets),
      onRetranslate: spend
        ? () => {
            setRunning("retranslate");
            decisions.retranslateMany(actionableRows, keepFailures);
          }
        : undefined,
      onClear: () => {
        setSelected(new Set());
        onCleared();
      },
    },
    rejecting,
    confirmReject: (entries) => {
      setRunning("reject");
      decisions.rejectMany(entries, keepFailures);
      setRejecting(null);
    },
    closeReject: () => setRejecting(null),
  };
}

interface ShortcutContext {
  readonly helpOpen: boolean;
  readonly setHelpOpen: (open: boolean) => void;
  readonly active: ActiveRow;
  readonly canWrite: boolean;
  readonly actions: RowActions;
  readonly toggleSelected: (row: ReviewQueueRow) => void;
}

function handleShortcut(action: ReviewShortcutAction, context: ShortcutContext): void {
  if (action === "help") {
    context.setHelpOpen(!context.helpOpen);
    return;
  }
  if (context.helpOpen) {
    return;
  }
  if (action === "next" || action === "previous") {
    context.active.move(action === "next" ? 1 : -1);
    return;
  }
  const row = context.active.activeRow;
  if (row === undefined || !context.canWrite) {
    return;
  }
  if (action === "select") {
    context.toggleSelected(row);
  } else {
    runRowShortcut(action, row, context.actions);
  }
}

function ReviewQueueContent({
  rows,
  filtered,
  facets,
  query,
  onFacetsChange,
  onQueryChange,
  onShowShortcuts,
  bulk,
  capabilities,
  actions,
  approveAll,
}: {
  readonly rows: readonly ReviewQueueRow[];
  readonly filtered: readonly ReviewQueueRow[];
  readonly facets: ReviewFacets;
  readonly query: string;
  readonly onFacetsChange: (facets: ReviewFacets) => void;
  readonly onQueryChange: (query: string) => void;
  readonly onShowShortcuts: () => void;
  readonly bulk: BulkSelection;
  readonly capabilities: StudioCapabilities | undefined;
  readonly actions: RowActions;
  readonly approveAll: ApproveAllAction | undefined;
}): ReactNode {
  const searchRef = useRef<HTMLInputElement | null>(null);
  if (rows.length === 0) {
    return (
      <EmptyState icon="review" title="All clear">
        Nothing to review right now.
      </EmptyState>
    );
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
        searchRef={searchRef}
        approveAll={approveAll}
      />
      {capabilities?.writeToDisk === true ? (
        <ReviewBulkBar {...bulk.bar} approveDisabled={facets.reviewState === "approved"} />
      ) : null}
      {filtered.length === 0 ? (
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

function isTypingElsewhere(active: Element | null): boolean {
  if (!(active instanceof HTMLElement) || active.closest("tr") !== null) {
    return false;
  }
  return classifyShortcutTarget(shortcutTargetOf(active)) === "editable";
}

function useSettledFocus(
  ready: boolean,
  focusActive: () => void,
): { readonly request: () => void } {
  const [requested, setRequested] = useState(0);
  const handled = useRef(0);
  useEffect(() => {
    if (requested === handled.current || !ready) {
      return;
    }
    handled.current = requested;
    if (!isTypingElsewhere(document.activeElement)) {
      focusActive();
    }
  });
  return { request: () => setRequested((count) => count + 1) };
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
  const approveAll = approveAllFor(
    facets,
    filterReviewRows(rows, filterOf("")).length,
    capabilities?.writeToDisk === true,
    setApprovingLocale,
  );
  const active = useActiveRow(filtered);
  const settledFocus = useSettledFocus(
    view.kind === "data" &&
      !decisions.awaitingReload() &&
      editing === null &&
      rejecting === null &&
      approvingLocale === null,
    active.focusActive,
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
        facets={facets}
        query={query}
        onFacetsChange={setFacets}
        onQueryChange={setQuery}
        onShowShortcuts={() => setHelpOpen(true)}
        bulk={bulk}
        capabilities={capabilities}
        actions={actions}
        approveAll={approveAll}
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
