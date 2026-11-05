import {
  Checkbox,
  microLabelClassName,
  Table,
  TableBody,
  TableCard,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@verbatra/ui";
import type { ReactNode } from "react";
import type { ReviewQueueRow } from "../client/review-queue-data.js";
import type { SelectionState } from "../client/review-selection.js";
import type { StudioCapabilities } from "../shared/rpc/snapshot.js";
import { cn } from "./lib/cn.js";
import { ProvenanceBadge } from "./ProvenanceBadge.js";
import type { RejectingTarget } from "./ReviewDialogs.js";
import { ReviewReasonChips } from "./ReviewReasonChips.js";
import { ReviewRowActions, type RowBusy } from "./ReviewRowActions.js";
import { TranslationValue } from "./TranslationValue.js";
import { useMediaQuery } from "./use-media-query.js";
import { rowId } from "./use-review-decisions.js";

export interface RowActions {
  readonly onEdit: (row: ReviewQueueRow, viaShortcut: boolean) => void;
  readonly onApprove: (row: ReviewQueueRow, value: string) => void;
  readonly onReject: (target: RejectingTarget) => void;
  readonly onRetranslate: ((row: ReviewQueueRow) => void) | undefined;
  readonly onActivate: (row: ReviewQueueRow) => void;
  readonly currentValueOf: (row: ReviewQueueRow) => string | undefined;
  readonly sourceOf: (row: ReviewQueueRow) => string | undefined;
  readonly sourceLocale: string | undefined;
  readonly busyOf: (row: ReviewQueueRow) => RowBusy | undefined;
  readonly activeId: string | null;
  readonly rowRefs: Map<string, HTMLTableRowElement>;
  readonly selected: ReadonlySet<string>;
  readonly onToggleSelected: (row: ReviewQueueRow) => void;
}

const WIDE_LAYOUT_QUERY = "(min-width: 1280px)";

const ACTIVE_ROW_CLASSNAME = "bg-accent/60";

const ROW_FOCUS_CLASSNAME =
  "focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring";

const ROW_TEXT_CLASSNAME =
  "block w-fit max-w-full truncate group-focus-within:whitespace-pre-wrap group-focus-within:break-words";

function ReviewEntry({
  row,
  source,
  sourceLocale,
  value,
}: {
  readonly row: ReviewQueueRow;
  readonly source: string | undefined;
  readonly sourceLocale: string | undefined;
  readonly value: string | undefined;
}): ReactNode {
  return (
    <>
      <span className="block break-all font-mono" data-row-key="">
        {row.key}
      </span>
      {value === undefined ? (
        <span className="block text-xs text-muted-foreground">
          Loading the current translation…
        </span>
      ) : (
        <dl className="m-0 mt-1 grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-2 gap-y-0.5 text-xs">
          {source === undefined ? null : (
            <>
              <dt className={microLabelClassName}>Source</dt>
              <dd className="m-0 min-w-0">
                <TranslationValue
                  value={source}
                  locale={sourceLocale}
                  className={cn(ROW_TEXT_CLASSNAME, "text-muted-foreground")}
                  title={source}
                  data-row-source=""
                />
              </dd>
            </>
          )}
          <dt className={microLabelClassName}>Target</dt>
          <dd className="m-0 min-w-0">
            <TranslationValue
              value={value}
              locale={row.locale}
              className={cn(ROW_TEXT_CLASSNAME, "text-foreground")}
              title={value}
              data-row-value=""
            />
          </dd>
        </dl>
      )}
    </>
  );
}

function RowActionsFor({
  row,
  value,
  actions,
  wrap,
}: {
  readonly row: ReviewQueueRow;
  readonly value: string | undefined;
  readonly actions: RowActions;
  readonly wrap: boolean;
}): ReactNode {
  const onRetranslate = actions.onRetranslate;
  return (
    <ReviewRowActions
      wrap={wrap}
      decisionDisabled={value === undefined}
      approveDisabled={row.reviewState === "approved"}
      busy={actions.busyOf(row)}
      shortcutsActive={actions.activeId === rowId(row)}
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
      onEdit={() => actions.onEdit(row, false)}
      onRetranslate={onRetranslate === undefined ? undefined : () => onRetranslate(row)}
    />
  );
}

function RowWhy({ row }: { readonly row: ReviewQueueRow }): ReactNode {
  return (
    <span className="flex flex-wrap items-center gap-1">
      <ProvenanceBadge provenance={{ origin: row.origin, reviewState: row.reviewState }} />
      <ReviewReasonChips reasons={row.reasons} />
    </span>
  );
}

function ReviewRow({
  row,
  canWrite,
  wide,
  actions,
}: {
  readonly row: ReviewQueueRow;
  readonly canWrite: boolean;
  readonly wide: boolean;
  readonly actions: RowActions;
}): ReactNode {
  const value = actions.currentValueOf(row);
  const id = rowId(row);
  const active = actions.activeId === id;
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
      className={cn("group align-top", ROW_FOCUS_CLASSNAME, active && ACTIVE_ROW_CLASSNAME)}
      onFocus={() => actions.onActivate(row)}
      onClick={() => actions.onActivate(row)}
    >
      {canWrite ? (
        <TableCell className="w-8 pe-0">
          <Checkbox
            checked={actions.selected.has(id)}
            aria-label={`Select ${row.key} (${row.locale})`}
            onChange={() => actions.onToggleSelected(row)}
          />
        </TableCell>
      ) : null}
      <TableCell mono>{row.locale}</TableCell>
      <TableCell className="w-full max-w-0">
        <ReviewEntry
          row={row}
          source={actions.sourceOf(row)}
          sourceLocale={actions.sourceLocale}
          value={value}
        />
        {wide ? null : (
          <div className="mt-2 space-y-2" data-row-stacked="">
            <RowWhy row={row} />
            {canWrite ? <RowActionsFor row={row} value={value} actions={actions} wrap /> : null}
          </div>
        )}
      </TableCell>
      {wide ? (
        <TableCell>
          <RowWhy row={row} />
        </TableCell>
      ) : null}
      {wide && canWrite ? (
        <TableCell>
          <RowActionsFor row={row} value={value} actions={actions} wrap={false} />
        </TableCell>
      ) : null}
    </TableRow>
  );
}

export function ReviewTable({
  rows,
  capabilities,
  actions,
  selection,
  onSelectAll,
}: {
  readonly rows: readonly ReviewQueueRow[];
  readonly capabilities: StudioCapabilities | undefined;
  readonly actions: RowActions;
  readonly selection: SelectionState;
  readonly onSelectAll: (on: boolean) => void;
}): ReactNode {
  const canWrite = capabilities?.writeToDisk === true;
  const wide = useMediaQuery(WIDE_LAYOUT_QUERY, true);
  return (
    <TableCard>
      <Table className={wide ? undefined : "min-w-0"}>
        <TableHead>
          <tr>
            {canWrite ? (
              <TableHeaderCell className="w-8 pe-0">
                <Checkbox
                  checked={selection === "all"}
                  indeterminate={selection === "some"}
                  aria-label="Select every shown entry"
                  onChange={() => onSelectAll(selection !== "all")}
                />
              </TableHeaderCell>
            ) : null}
            <TableHeaderCell>Locale</TableHeaderCell>
            <TableHeaderCell>{wide ? "Key" : "Entry"}</TableHeaderCell>
            {wide ? <TableHeaderCell>Reasons</TableHeaderCell> : null}
            {wide && canWrite ? (
              <TableHeaderCell data-actions-column="">Actions</TableHeaderCell>
            ) : null}
          </tr>
        </TableHead>
        <TableBody>
          {rows.map((row) => (
            <ReviewRow
              row={row}
              canWrite={canWrite}
              wide={wide}
              actions={actions}
              key={`${row.locale} ${row.key}`}
            />
          ))}
        </TableBody>
      </Table>
    </TableCard>
  );
}
