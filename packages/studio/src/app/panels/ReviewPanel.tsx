import type { ReviewReasonCode } from "@verbatra/sdk";
import type { ChangeEvent, ReactNode, RefObject } from "react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { localeValuesOrEmpty, valuesIndex } from "../../client/locale-values.js";
import { canRetranslateReviewed } from "../../client/retranslate-eligibility.js";
import {
  deriveRetranslateOutcome,
  isProtectedRefusal,
  type RetranslateOutcome,
} from "../../client/retranslate-outcome.js";
import {
  deriveReviewDecisionOutcome,
  isStaleValueOutcome,
} from "../../client/review-decision-outcome.js";
import { filterReviewRows, uniqueReviewLocales } from "../../client/review-filter.js";
import type { ReviewQueueRow } from "../../client/review-queue-data.js";
import { reviewedValueFor, visibleReviewQueueRows } from "../../client/review-queue-data.js";
import { reviewReasonLabel } from "../../client/review-reason-labels.js";
import {
  clampIndex,
  classifyShortcutTarget,
  type ReviewShortcutAction,
  resolveReviewShortcut,
  type ShortcutTargetShape,
  shortcutKeysFor,
  stepIndex,
} from "../../client/review-shortcuts.js";
import { settledActionStatusLabel } from "../../client/settled-action-status.js";
import type { StudioCapabilities } from "../../shared/rpc/snapshot.js";
import { reviewOverlayStore, rpcClient } from "../api.js";
import { Badge } from "../Badge.js";
import { Button } from "../Button.js";
import { EditEntryDialog } from "../EditEntryDialog.js";
import { ErrorMessage } from "../ErrorMessage.js";
import { SearchInput } from "../Input.js";
import { actionStatusTextClassName } from "../lib/action-status-classes.js";
import { cn } from "../lib/cn.js";
import { PageHeader } from "../PageHeader.js";
import type { PanelProps } from "../panel-props.js";
import { RejectEntryDialog } from "../RejectEntryDialog.js";
import { ReviewRowActions } from "../ReviewRowActions.js";
import { ReviewShortcutsDialog } from "../ReviewShortcutsDialog.js";
import { Select } from "../Select.js";
import { TableSkeleton } from "../Skeleton.js";
import {
  Table,
  TableBody,
  TableCard,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "../Table.js";
import { FilterBar } from "../Toolbar.js";
import { TranslationValue } from "../TranslationValue.js";
import { EmptyState } from "../ui.js";
import { useCapabilities } from "../use-capabilities.js";
import { useLocaleValues } from "../use-locale-values.js";
import { useReviewOverlaySignal } from "../use-review-overlay-signal.js";
import { useReviewQueue } from "../use-review-queue.js";

interface EditingTarget {
  readonly locale: string;
  readonly key: string;
}

interface RejectingTarget extends EditingTarget {
  readonly value: string;
}

interface RowActions {
  readonly onEdit: (target: EditingTarget) => void;
  readonly onApprove: (row: ReviewQueueRow, value: string) => void;
  readonly onReject: (target: RejectingTarget) => void;
  readonly onRetranslate: ((row: ReviewQueueRow) => void) | undefined;
  readonly onActivate: (row: ReviewQueueRow) => void;
  readonly currentValueOf: (row: ReviewQueueRow) => string | undefined;
  readonly pending: ReadonlyMap<string, string>;
  readonly activeId: string | null;
  readonly rowRefs: Map<string, HTMLTableRowElement>;
}

type DecisionNotice =
  | { readonly kind: "approved"; readonly locale: string; readonly key: string }
  | { readonly kind: "rejected"; readonly locale: string; readonly key: string }
  | { readonly kind: "retranslated"; readonly locale: string; readonly key: string }
  | {
      readonly kind: "failed";
      readonly action: "approve" | "reject" | "retranslate";
      readonly locale: string;
      readonly key: string;
      readonly message: string;
    };

function rowId(row: EditingTarget): string {
  return `${row.locale}\u0000${row.key}`;
}

function ReasonChips({ reasons }: { readonly reasons: readonly ReviewReasonCode[] }): ReactNode {
  return (
    <span className="flex flex-wrap gap-1">
      {reasons.map((reason) => {
        const view = reviewReasonLabel(reason);
        return (
          <Badge tone={view.tone} key={reason}>
            {view.label}
          </Badge>
        );
      })}
    </span>
  );
}

function ReviewKeyCell({
  row,
  value,
}: {
  readonly row: ReviewQueueRow;
  readonly value: string | undefined;
}): ReactNode {
  return (
    <TableCell mono>
      <span className="block" data-row-key="">
        {row.key}
      </span>
      {value === undefined ? (
        <span className="block font-sans text-xs text-muted-foreground">
          Loading the current translation…
        </span>
      ) : (
        <TranslationValue
          value={value}
          locale={row.locale}
          className="block w-fit max-w-[240px] truncate text-xs text-muted-foreground sm:max-w-md"
          title={value}
          data-row-value=""
        />
      )}
    </TableCell>
  );
}

const ACTIVE_ROW_CLASSNAME = "bg-accent/60";

const ROW_FOCUS_CLASSNAME =
  "focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring";

function ReviewRow({
  row,
  capabilities,
  actions,
}: {
  readonly row: ReviewQueueRow;
  readonly capabilities: StudioCapabilities | undefined;
  readonly actions: RowActions;
}): ReactNode {
  const value = actions.currentValueOf(row);
  const id = rowId(row);
  const pending = actions.pending.get(id);
  const active = actions.activeId === id;
  const onRetranslate = actions.onRetranslate;
  return (
    <TableRow
      ref={(element) => {
        if (element === null) {
          actions.rowRefs.delete(id);
        } else {
          actions.rowRefs.set(id, element);
        }
      }}
      tabIndex={active ? 0 : -1}
      aria-current={active ? "true" : undefined}
      data-active={active ? "" : undefined}
      className={cn(ROW_FOCUS_CLASSNAME, active && ACTIVE_ROW_CLASSNAME)}
      onFocus={() => actions.onActivate(row)}
      onClick={() => actions.onActivate(row)}
    >
      <TableCell mono>{row.locale}</TableCell>
      <ReviewKeyCell row={row} value={value} />
      <TableCell>
        <ReasonChips reasons={row.reasons} />
      </TableCell>
      {capabilities?.writeToDisk === true ? (
        <TableCell className="whitespace-nowrap">
          <ReviewRowActions
            decisionDisabled={value === undefined}
            {...(pending !== undefined ? { pendingLabel: pending } : {})}
            onApprove={() => {
              if (value !== undefined) {
                actions.onApprove(row, value);
              }
            }}
            onReject={() => {
              if (value !== undefined) {
                actions.onReject({ locale: row.locale, key: row.key, value });
              }
            }}
            onEdit={() => actions.onEdit({ locale: row.locale, key: row.key })}
            onRetranslate={onRetranslate === undefined ? undefined : () => onRetranslate(row)}
          />
        </TableCell>
      ) : null}
    </TableRow>
  );
}

function ReviewTable({
  rows,
  capabilities,
  actions,
}: {
  readonly rows: readonly ReviewQueueRow[];
  readonly capabilities: StudioCapabilities | undefined;
  readonly actions: RowActions;
}): ReactNode {
  const showActions = capabilities?.writeToDisk === true;
  return (
    <TableCard>
      <Table>
        <TableHead>
          <tr>
            <TableHeaderCell>Locale</TableHeaderCell>
            <TableHeaderCell>Key</TableHeaderCell>
            <TableHeaderCell>Reasons</TableHeaderCell>
            {showActions ? <TableHeaderCell>Actions</TableHeaderCell> : null}
          </tr>
        </TableHead>
        <TableBody>
          {rows.map((row) => (
            <ReviewRow
              row={row}
              capabilities={capabilities}
              actions={actions}
              key={`${row.locale} ${row.key}`}
            />
          ))}
        </TableBody>
      </Table>
    </TableCard>
  );
}

function noticeText(notice: DecisionNotice): string {
  const target = `${notice.key} (${notice.locale})`;
  if (notice.kind === "approved") {
    return `Approved ${target}. The decision is saved in verbatra.provenance.json.`;
  }
  if (notice.kind === "rejected") {
    return `Rejected ${target}. Its translation was removed and the decision is saved in verbatra.provenance.json.`;
  }
  if (notice.kind === "retranslated") {
    return `Retranslated ${target}. Review the new value, then approve or reject it.`;
  }
  return `Could not ${notice.action} ${target}: ${notice.message}`;
}

function DecisionStatus({
  notice,
  statusRef,
}: {
  readonly notice: DecisionNotice | null;
  readonly statusRef: RefObject<HTMLParagraphElement | null>;
}): ReactNode {
  const failed = notice?.kind === "failed";
  return (
    <p
      ref={statusRef}
      tabIndex={-1}
      className={cn(
        "mb-3 min-h-4 focus-visible:outline-none",
        actionStatusTextClassName(notice === null ? undefined : failed ? "failure" : "success"),
      )}
      role={failed ? "alert" : "status"}
    >
      {notice === null ? null : noticeText(notice)}
    </p>
  );
}

function ReviewFilterBar({
  locales,
  locale,
  query,
  onLocaleChange,
  onQueryChange,
  onShowShortcuts,
  matchCount,
}: {
  readonly locales: readonly string[];
  readonly locale: string;
  readonly query: string;
  readonly onLocaleChange: (event: ChangeEvent<HTMLSelectElement>) => void;
  readonly onQueryChange: (event: ChangeEvent<HTMLInputElement>) => void;
  readonly onShowShortcuts: () => void;
  readonly matchCount: number;
}): ReactNode {
  return (
    <FilterBar label="Review queue filters">
      <Select aria-label="Filter by locale" value={locale} onChange={onLocaleChange}>
        <option value="">All locales</option>
        {locales.map((code) => (
          <option key={code} value={code}>
            {code}
          </option>
        ))}
      </Select>
      <SearchInput
        aria-label="Filter by key or translation text"
        placeholder="Filter by key or text…"
        value={query}
        onChange={onQueryChange}
      />
      <span className="text-sm text-muted-foreground">
        {matchCount} {matchCount === 1 ? "entry" : "entries"}
      </span>
      <Button
        variant="ghost"
        className="ms-auto"
        onClick={onShowShortcuts}
        aria-keyshortcuts={shortcutKeysFor("help")}
      >
        Keyboard shortcuts
        <kbd className="rounded-sm border border-border bg-muted px-1 font-mono text-[11px] text-muted-foreground">
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
        kicker="Workspace"
        title="Review"
        description="Entries the most recent run flagged that nobody has approved, rejected, or rewritten yet. Decisions are saved to verbatra.provenance.json; commit it to share them."
      />
      <ReviewPanelBody refreshToken={refreshToken} />
    </>
  );
}

const PROTECTED_RETRANSLATE_MESSAGE =
  "a person wrote this value. Open the key on the Translations page to replace it anyway.";

function retranslateFailure(protectedValue: boolean, outcome: RetranslateOutcome): string {
  if (protectedValue) {
    return PROTECTED_RETRANSLATE_MESSAGE;
  }
  return outcome.kind === "error" ? outcome.message : settledActionStatusLabel(outcome, "");
}

function useDecisions(onDecided: () => void): {
  readonly pending: ReadonlyMap<string, string>;
  readonly notice: DecisionNotice | null;
  readonly approve: (row: ReviewQueueRow, value: string) => void;
  readonly retranslate: (row: ReviewQueueRow) => void;
  readonly rejected: (target: EditingTarget) => void;
  readonly rejectStale: (target: EditingTarget, message: string) => void;
  readonly reloaded: () => void;
} {
  const [pending, setPending] = useState<ReadonlyMap<string, string>>(new Map());
  const awaitingReload = useRef<Set<string>>(new Set());
  const [notice, setNotice] = useState<DecisionNotice | null>(null);

  function setRowPending(row: EditingTarget, label: string | undefined): void {
    setPending((current) => {
      const next = new Map(current);
      if (label === undefined) {
        next.delete(rowId(row));
      } else {
        next.set(rowId(row), label);
      }
      return next;
    });
  }

  function reloadThenSettle(row: EditingTarget): void {
    awaitingReload.current.add(rowId(row));
    onDecided();
  }

  async function approve(row: ReviewQueueRow, value: string): Promise<void> {
    setRowPending(row, "Approving…");
    const response = await rpcClient.call("review.approve", {
      locale: row.locale,
      key: row.key,
      expectedValue: value,
    });
    const outcome = deriveReviewDecisionOutcome(response);
    setNotice(
      outcome.kind === "success"
        ? { kind: "approved", locale: row.locale, key: row.key }
        : {
            kind: "failed",
            action: "approve",
            locale: row.locale,
            key: row.key,
            message: outcome.message,
          },
    );
    if (outcome.kind === "success" || isStaleValueOutcome(outcome)) {
      reloadThenSettle(row);
    } else {
      setRowPending(row, undefined);
    }
  }

  async function retranslate(row: ReviewQueueRow): Promise<void> {
    setRowPending(row, "Retranslating…");
    const response = await rpcClient.call("translation.retranslateEntry", {
      locale: row.locale,
      key: row.key,
    });
    const outcome = deriveRetranslateOutcome(response);
    if (outcome.kind === "success") {
      setNotice({ kind: "retranslated", locale: row.locale, key: row.key });
      reloadThenSettle(row);
      return;
    }
    setNotice({
      kind: "failed",
      action: "retranslate",
      locale: row.locale,
      key: row.key,
      message: retranslateFailure(isProtectedRefusal(response), outcome),
    });
    setRowPending(row, undefined);
  }

  const reloaded = useCallback((): void => {
    const settled = awaitingReload.current;
    if (settled.size === 0) {
      return;
    }
    awaitingReload.current = new Set();
    setPending((current) => {
      const next = new Map(current);
      for (const id of settled) {
        next.delete(id);
      }
      return next;
    });
  }, []);

  return {
    pending,
    notice,
    approve: (row, value) => void approve(row, value),
    retranslate: (row) => void retranslate(row),
    rejected: (target) => {
      setNotice({ kind: "rejected", locale: target.locale, key: target.key });
      onDecided();
    },
    rejectStale: (target, message) => {
      setNotice({ kind: "failed", action: "reject", ...target, message });
      onDecided();
    },
    reloaded,
  };
}

interface ActiveRow {
  readonly activeRow: ReviewQueueRow | undefined;
  readonly rowRefs: Map<string, HTMLTableRowElement>;
  readonly activate: (row: ReviewQueueRow) => void;
  readonly move: (delta: number) => void;
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
  action: Exclude<ReviewShortcutAction, "next" | "previous" | "help">,
  row: ReviewQueueRow,
  actions: RowActions,
): void {
  if (actions.pending.has(rowId(row))) {
    return;
  }
  const value = actions.currentValueOf(row);
  if (action === "edit") {
    actions.onEdit({ locale: row.locale, key: row.key });
  } else if (action === "retranslate") {
    actions.onRetranslate?.(row);
  } else if (value !== undefined && action === "approve") {
    actions.onApprove(row, value);
  } else if (value !== undefined) {
    actions.onReject({ locale: row.locale, key: row.key, value });
  }
}

type Decisions = ReturnType<typeof useDecisions>;

function ReviewDialogs({
  helpOpen,
  spend,
  editing,
  rejecting,
  decisions,
  onCloseHelp,
  onCloseEditor,
  onCloseReject,
}: {
  readonly helpOpen: boolean;
  readonly spend: boolean;
  readonly editing: EditingTarget | null;
  readonly rejecting: RejectingTarget | null;
  readonly decisions: Decisions;
  readonly onCloseHelp: () => void;
  readonly onCloseEditor: () => void;
  readonly onCloseReject: () => void;
}): ReactNode {
  return (
    <>
      {helpOpen ? <ReviewShortcutsDialog spend={spend} onClose={onCloseHelp} /> : null}
      {editing !== null ? (
        <EditEntryDialog
          locale={editing.locale}
          keyName={editing.key}
          onClose={onCloseEditor}
          onAccepted={(acceptedLocale, key) => {
            reviewOverlayStore.markActioned({ locale: acceptedLocale, key });
            onCloseEditor();
          }}
        />
      ) : null}
      {rejecting !== null ? (
        <RejectEntryDialog
          locale={rejecting.locale}
          keyName={rejecting.key}
          value={rejecting.value}
          onClose={onCloseReject}
          onRejected={() => {
            decisions.rejected(rejecting);
            onCloseReject();
          }}
          onValueChanged={(message) => {
            decisions.rejectStale({ locale: rejecting.locale, key: rejecting.key }, message);
            onCloseReject();
          }}
        />
      ) : null}
    </>
  );
}

function ReviewPanelBody({ refreshToken }: PanelProps): ReactNode {
  const [reloadToken, setReloadToken] = useState(0);
  const view = useReviewQueue(refreshToken, reloadToken);
  const capabilitiesState = useCapabilities();
  const capabilities =
    capabilitiesState.kind === "loaded" ? capabilitiesState.capabilities : undefined;
  useReviewOverlaySignal();
  const [editing, setEditing] = useState<EditingTarget | null>(null);
  const [rejecting, setRejecting] = useState<RejectingTarget | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [locale, setLocale] = useState("");
  const [query, setQuery] = useState("");
  const localeValues = localeValuesOrEmpty(useLocaleValues(refreshToken, reloadToken));
  const values = useMemo(() => valuesIndex(localeValues), [localeValues]);
  const decisions = useDecisions(() => setReloadToken((current) => current + 1));
  const statusRef = useRef<HTMLParagraphElement | null>(null);
  const settleReload = decisions.reloaded;
  useEffect(() => {
    if (view.kind === "data") {
      settleReload();
    }
  }, [view, settleReload]);
  useEffect(() => {
    if (decisions.notice !== null) {
      statusRef.current?.focus();
    }
  }, [decisions.notice]);

  const rows =
    view.kind === "data" && view.data.available
      ? visibleReviewQueueRows(view.data, reviewOverlayStore)
      : [];
  const filtered = filterReviewRows(rows, { locale: locale === "" ? null : locale, query }, values);
  const active = useActiveRow(filtered);
  const actions: RowActions = {
    onEdit: setEditing,
    onApprove: decisions.approve,
    onReject: setRejecting,
    onRetranslate: canRetranslateReviewed(capabilities) ? decisions.retranslate : undefined,
    onActivate: active.activate,
    currentValueOf: (row) => reviewedValueFor(values, row),
    pending: decisions.pending,
    activeId: active.activeRow === undefined ? null : rowId(active.activeRow),
    rowRefs: active.rowRefs,
  };

  useReviewShortcuts(editing === null && rejecting === null, (action) => {
    if (action === "help") {
      setHelpOpen(!helpOpen);
      return;
    }
    if (helpOpen) {
      return;
    }
    if (action === "next" || action === "previous") {
      active.move(action === "next" ? 1 : -1);
      return;
    }
    if (active.activeRow !== undefined && capabilities?.writeToDisk === true) {
      runRowShortcut(action, active.activeRow, actions);
    }
  });

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
      <EmptyState icon="review" title="No run recorded yet">
        Run <code>verbatra translate</code> or <code>verbatra watch</code> to populate this queue.
      </EmptyState>
    );
  }

  return (
    <div>
      {view.stale && <ErrorMessage error={view.error} prefix="Showing the last known queue." />}
      <DecisionStatus notice={decisions.notice} statusRef={statusRef} />
      {rows.length === 0 ? (
        <EmptyState icon="review" title="All clear">
          Nothing to review right now.
        </EmptyState>
      ) : (
        <>
          <ReviewFilterBar
            locales={uniqueReviewLocales(rows)}
            locale={locale}
            query={query}
            onLocaleChange={(event) => setLocale(event.target.value)}
            onQueryChange={(event) => setQuery(event.target.value)}
            onShowShortcuts={() => setHelpOpen(true)}
            matchCount={filtered.length}
          />
          {filtered.length === 0 ? (
            <EmptyState
              icon="search"
              title="No matching entries"
              action={
                <Button
                  onClick={() => {
                    setLocale("");
                    setQuery("");
                  }}
                >
                  Clear filters
                </Button>
              }
            >
              No flagged entry matches the current filters.
            </EmptyState>
          ) : (
            <ReviewTable rows={filtered} capabilities={capabilities} actions={actions} />
          )}
        </>
      )}
      <ReviewDialogs
        helpOpen={helpOpen}
        spend={canRetranslateReviewed(capabilities)}
        editing={editing}
        rejecting={rejecting}
        decisions={decisions}
        onCloseHelp={() => setHelpOpen(false)}
        onCloseEditor={() => setEditing(null)}
        onCloseReject={() => setRejecting(null)}
      />
    </div>
  );
}
