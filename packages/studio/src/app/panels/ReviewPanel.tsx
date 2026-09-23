import type { ReviewReasonCode } from "@verbatra/sdk";
import type { ChangeEvent, ReactNode } from "react";
import { useMemo, useState } from "react";
import { localeValuesOrEmpty, valuesIndex } from "../../client/locale-values.js";
import { deriveReviewDecisionOutcome } from "../../client/review-decision-outcome.js";
import { filterReviewRows, uniqueReviewLocales } from "../../client/review-filter.js";
import type { ReviewQueueRow } from "../../client/review-queue-data.js";
import { reviewedValueFor, visibleReviewQueueRows } from "../../client/review-queue-data.js";
import { reviewReasonLabel } from "../../client/review-reason-labels.js";
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
  readonly currentValueOf: (row: ReviewQueueRow) => string | undefined;
  readonly busy: ReadonlySet<string>;
}

type DecisionNotice =
  | { readonly kind: "approved"; readonly locale: string; readonly key: string }
  | { readonly kind: "rejected"; readonly locale: string; readonly key: string }
  | {
      readonly kind: "failed";
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
  return (
    <TableRow>
      <TableCell mono>{row.locale}</TableCell>
      <TableCell mono>{row.key}</TableCell>
      <TableCell>
        <ReasonChips reasons={row.reasons} />
      </TableCell>
      {capabilities?.writeToDisk === true ? (
        <TableCell>
          <ReviewRowActions
            decisionDisabled={value === undefined || actions.busy.has(rowId(row))}
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
  return `Could not approve ${target}: ${notice.message}`;
}

function DecisionStatus({ notice }: { readonly notice: DecisionNotice | null }): ReactNode {
  if (notice === null) {
    return null;
  }
  const failed = notice.kind === "failed";
  return (
    <p
      className={cn("mb-3", actionStatusTextClassName(failed ? "failure" : "success"))}
      role={failed ? "alert" : "status"}
    >
      {noticeText(notice)}
    </p>
  );
}

function ReviewFilterBar({
  locales,
  locale,
  query,
  onLocaleChange,
  onQueryChange,
  matchCount,
}: {
  readonly locales: readonly string[];
  readonly locale: string;
  readonly query: string;
  readonly onLocaleChange: (event: ChangeEvent<HTMLSelectElement>) => void;
  readonly onQueryChange: (event: ChangeEvent<HTMLInputElement>) => void;
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

function useDecisions(onDecided: () => void): {
  readonly busy: ReadonlySet<string>;
  readonly notice: DecisionNotice | null;
  readonly approve: (row: ReviewQueueRow, value: string) => void;
  readonly rejected: (target: EditingTarget) => void;
} {
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());
  const [notice, setNotice] = useState<DecisionNotice | null>(null);

  function setRowBusy(row: EditingTarget, isBusy: boolean): void {
    setBusy((current) => {
      const next = new Set(current);
      if (isBusy) {
        next.add(rowId(row));
      } else {
        next.delete(rowId(row));
      }
      return next;
    });
  }

  async function approve(row: ReviewQueueRow, value: string): Promise<void> {
    setRowBusy(row, true);
    const response = await rpcClient.call("review.approve", {
      locale: row.locale,
      key: row.key,
      expectedValue: value,
    });
    const outcome = deriveReviewDecisionOutcome(response);
    setRowBusy(row, false);
    setNotice(
      outcome.kind === "success"
        ? { kind: "approved", locale: row.locale, key: row.key }
        : { kind: "failed", locale: row.locale, key: row.key, message: outcome.message },
    );
    if (outcome.kind === "success") {
      onDecided();
    }
  }

  return {
    busy,
    notice,
    approve: (row, value) => void approve(row, value),
    rejected: (target) => {
      setNotice({ kind: "rejected", locale: target.locale, key: target.key });
      onDecided();
    },
  };
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
  const [locale, setLocale] = useState("");
  const [query, setQuery] = useState("");
  const localeValues = localeValuesOrEmpty(useLocaleValues(refreshToken));
  const values = useMemo(() => valuesIndex(localeValues), [localeValues]);
  const decisions = useDecisions(() => setReloadToken((current) => current + 1));

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

  const data = view.data;
  if (!data.available) {
    return (
      <EmptyState icon="review" title="No run recorded yet">
        Run <code>verbatra translate</code> or <code>verbatra watch</code> to populate this queue.
      </EmptyState>
    );
  }

  const rows = visibleReviewQueueRows(data, reviewOverlayStore);
  const filtered = filterReviewRows(rows, { locale: locale === "" ? null : locale, query }, values);
  const actions: RowActions = {
    onEdit: setEditing,
    onApprove: decisions.approve,
    onReject: setRejecting,
    currentValueOf: (row) => reviewedValueFor(values, row),
    busy: decisions.busy,
  };

  return (
    <div>
      {view.stale && <ErrorMessage error={view.error} prefix="Showing the last known queue." />}
      <DecisionStatus notice={decisions.notice} />
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
      {editing !== null ? (
        <EditEntryDialog
          locale={editing.locale}
          keyName={editing.key}
          onClose={() => setEditing(null)}
          onAccepted={(acceptedLocale, key) => {
            reviewOverlayStore.markActioned({ locale: acceptedLocale, key });
            setEditing(null);
          }}
        />
      ) : null}
      {rejecting !== null ? (
        <RejectEntryDialog
          locale={rejecting.locale}
          keyName={rejecting.key}
          value={rejecting.value}
          onClose={() => setRejecting(null)}
          onRejected={() => {
            decisions.rejected(rejecting);
            setRejecting(null);
          }}
        />
      ) : null}
    </div>
  );
}
