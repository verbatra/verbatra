import type { ReviewReasonCode } from "@verbatra/sdk";
import type { ChangeEvent, ReactNode } from "react";
import { useMemo, useState } from "react";
import { localeValuesOrEmpty, valuesIndex } from "../../client/locale-values.js";
import { filterReviewRows, uniqueReviewLocales } from "../../client/review-filter.js";
import type { ReviewQueueRow } from "../../client/review-queue-data.js";
import { visibleReviewQueueRows } from "../../client/review-queue-data.js";
import { reviewReasonLabel } from "../../client/review-reason-labels.js";
import type { StudioCapabilities } from "../../shared/rpc/snapshot.js";
import { reviewOverlayStore } from "../api.js";
import { Badge } from "../Badge.js";
import { Button } from "../Button.js";
import { EditEntryDialog } from "../EditEntryDialog.js";
import { ErrorMessage } from "../ErrorMessage.js";
import { SearchInput } from "../Input.js";
import { PageHeader } from "../PageHeader.js";
import type { PanelProps } from "../panel-props.js";
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
  onEdit,
}: {
  readonly row: ReviewQueueRow;
  readonly capabilities: StudioCapabilities | undefined;
  readonly onEdit: (target: EditingTarget) => void;
}): ReactNode {
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
            onApprove={() => reviewOverlayStore.markActioned(row)}
            onReject={() => reviewOverlayStore.markActioned(row)}
            onEdit={() => onEdit({ locale: row.locale, key: row.key })}
          />
        </TableCell>
      ) : null}
    </TableRow>
  );
}

function ReviewTable({
  rows,
  capabilities,
  onEdit,
}: {
  readonly rows: readonly ReviewQueueRow[];
  readonly capabilities: StudioCapabilities | undefined;
  readonly onEdit: (target: EditingTarget) => void;
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
              onEdit={onEdit}
              key={`${row.locale} ${row.key}`}
            />
          ))}
        </TableBody>
      </Table>
    </TableCard>
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
        description="Entries flagged for human review by the most recent run."
      />
      <ReviewPanelBody refreshToken={refreshToken} />
    </>
  );
}

function ReviewPanelBody({ refreshToken }: PanelProps): ReactNode {
  const view = useReviewQueue(refreshToken);
  const capabilitiesState = useCapabilities();
  const capabilities =
    capabilitiesState.kind === "loaded" ? capabilitiesState.capabilities : undefined;
  useReviewOverlaySignal();
  const [editing, setEditing] = useState<EditingTarget | null>(null);
  const [locale, setLocale] = useState("");
  const [query, setQuery] = useState("");
  const localeValues = localeValuesOrEmpty(useLocaleValues(refreshToken));
  const values = useMemo(() => valuesIndex(localeValues), [localeValues]);

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

  return (
    <div>
      {view.stale && <ErrorMessage error={view.error} prefix="Showing the last known queue." />}
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
            <ReviewTable rows={filtered} capabilities={capabilities} onEdit={setEditing} />
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
    </div>
  );
}
