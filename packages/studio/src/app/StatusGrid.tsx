import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";
import { useMemo, useRef, useState } from "react";
import type { StatusData } from "../client/coverage.js";
import type { DiffLocale, KeyLocaleStatus } from "../client/diff-view.js";
import { deriveKeyLocaleStatus, driftKeys } from "../client/diff-view.js";
import { filterAndCapKeys, MAX_RENDERED_KEYS } from "../client/filter.js";
import { isRtlLocale } from "../client/locale-direction.js";
import type { GridArrowKey, GridPosition } from "../client/roving-tabindex.js";
import { clampGridPosition, moveGridFocus } from "../client/roving-tabindex.js";
import type { RefreshableView } from "../client/state.js";
import { Badge } from "./Badge.js";
import { DiffBadge } from "./DiffBadge.js";
import { ErrorMessage } from "./ErrorMessage.js";
import { cn } from "./lib/cn.js";
import { ProgressBar } from "./ProgressBar.js";
import { TableCard } from "./Table.js";
import { EmptyState } from "./ui.js";
import { useStatusData } from "./use-status-data.js";

const gridCellClassName = "px-3 py-2 text-start whitespace-nowrap";
const gridHeaderClassName =
  "border-b border-border bg-muted/60 px-3 py-2.5 text-start align-bottom text-xs font-semibold text-muted-foreground whitespace-nowrap";

export interface StatusGridProps {
  readonly locales: readonly DiffLocale[];
  readonly refreshToken: number;
  readonly onSelectKey: (key: string) => void;
}

const GRID_ARROW_KEYS: ReadonlySet<string> = new Set<GridArrowKey>([
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
]);

function isGridArrowKey(key: string): key is GridArrowKey {
  return GRID_ARROW_KEYS.has(key);
}

function cellRefKey(row: number, col: number): string {
  return `${row}:${col}`;
}

function percentForLocale(status: RefreshableView<StatusData>, locale: string): number | null {
  if (status.kind !== "data") {
    return null;
  }
  return status.data.rows.find((row) => row.locale === locale)?.percent ?? null;
}

function CompletenessBar({
  percent,
  unavailable,
}: {
  readonly percent: number | null;
  readonly unavailable: boolean;
}): ReactNode {
  if (percent === null) {
    return (
      <span className="mt-1 block text-xs font-normal text-muted-foreground">
        {unavailable ? "Coverage unavailable" : "Loading coverage"}
      </span>
    );
  }
  return (
    <div className="mt-1 flex items-center gap-2 text-xs font-normal text-muted-foreground">
      <ProgressBar percent={percent} className="w-[60px] flex-none" />
      <span className="whitespace-nowrap">{percent}% up to date</span>
    </div>
  );
}

interface GridCellProps {
  readonly status: KeyLocaleStatus;
  readonly row: number;
  readonly col: number;
  readonly isCurrent: boolean;
  readonly keyName: string;
  readonly localeName: string;
  readonly onActivate: (keyName: string) => void;
  readonly onArrow: (row: number, col: number, key: GridArrowKey) => void;
  readonly onFocusCell: (row: number, col: number) => void;
  readonly registerCell: (row: number, col: number, element: HTMLButtonElement | null) => void;
}

function GridCell({
  status,
  row,
  col,
  isCurrent,
  keyName,
  localeName,
  onActivate,
  onArrow,
  onFocusCell,
  registerCell,
}: GridCellProps): ReactNode {
  function handleKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>): void {
    if (isGridArrowKey(event.key)) {
      event.preventDefault();
      onArrow(row, col, event.key);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onActivate(keyName);
    }
  }

  return (
    <td
      className={cn(gridCellClassName, "px-2 py-1")}
      dir={isRtlLocale(localeName) ? "rtl" : undefined}
    >
      <button
        type="button"
        ref={(element) => registerCell(row, col, element)}
        className="block w-full rounded-md p-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
        tabIndex={isCurrent ? 0 : -1}
        onFocus={() => onFocusCell(row, col)}
        onKeyDown={handleKeyDown}
        onClick={() => onActivate(keyName)}
        aria-label={`${keyName} in ${localeName}: ${status}`}
      >
        {status === "in-sync" ? <Badge tone="success">In sync</Badge> : <DiffBadge tone={status} />}
      </button>
    </td>
  );
}

interface GridBodyRowProps {
  readonly keyName: string;
  readonly row: number;
  readonly locales: readonly DiffLocale[];
  readonly position: GridPosition;
  readonly onActivate: (keyName: string) => void;
  readonly onArrow: (row: number, col: number, key: GridArrowKey) => void;
  readonly onFocusCell: (row: number, col: number) => void;
  readonly registerCell: (row: number, col: number, element: HTMLButtonElement | null) => void;
}

function GridBodyRow({
  keyName,
  row,
  locales,
  position,
  onActivate,
  onArrow,
  onFocusCell,
  registerCell,
}: GridBodyRowProps): ReactNode {
  const statusRows = deriveKeyLocaleStatus(locales, keyName);
  return (
    <tr className="hover:bg-accent/40">
      <th
        scope="row"
        className={cn(
          gridCellClassName,
          "sticky start-0 bg-card text-start font-mono text-sm font-semibold text-foreground",
        )}
      >
        {keyName}
      </th>
      {statusRows.map((cell, col) => (
        <GridCell
          key={cell.locale}
          status={cell.status}
          row={row}
          col={col}
          isCurrent={position.row === row && position.col === col}
          keyName={keyName}
          localeName={cell.locale}
          onActivate={onActivate}
          onArrow={onArrow}
          onFocusCell={onFocusCell}
          registerCell={registerCell}
        />
      ))}
    </tr>
  );
}

export function StatusGrid({ locales, refreshToken, onSelectKey }: StatusGridProps): ReactNode {
  const capped = useMemo(() => filterAndCapKeys(driftKeys(locales), ""), [locales]);
  const keys = capped.items;
  const status = useStatusData(refreshToken);
  const [position, setPosition] = useState<GridPosition>({ row: 0, col: 0 });
  const safePosition = clampGridPosition(position, {
    rowCount: keys.length,
    colCount: locales.length,
  });
  const cellRefs = useRef(new Map<string, HTMLButtonElement>());

  function registerCell(row: number, col: number, element: HTMLButtonElement | null): void {
    const key = cellRefKey(row, col);
    if (element === null) {
      cellRefs.current.delete(key);
      return;
    }
    cellRefs.current.set(key, element);
  }

  function handleArrow(row: number, col: number, key: GridArrowKey): void {
    const next = moveGridFocus({ row, col }, key, {
      rowCount: keys.length,
      colCount: locales.length,
    });
    setPosition(next);
    cellRefs.current.get(cellRefKey(next.row, next.col))?.focus();
  }

  function handleFocusCell(row: number, col: number): void {
    setPosition({ row, col });
  }

  if (keys.length === 0) {
    return <EmptyState title="No drift">No drift-affected keys to show.</EmptyState>;
  }

  return (
    <>
      {status.kind === "data" && status.stale && (
        <ErrorMessage error={status.error} prefix="Showing the last known coverage." />
      )}
      <TableCard>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th
                scope="col"
                className={cn(
                  gridHeaderClassName,
                  "min-w-[160px] font-mono text-[11px] uppercase tracking-wider",
                )}
              >
                Key
              </th>
              {locales.map((locale) => (
                <th
                  key={locale.locale}
                  scope="col"
                  className={cn(gridHeaderClassName, "min-w-[140px]")}
                  dir={isRtlLocale(locale.locale) ? "rtl" : undefined}
                >
                  <span className="font-mono">{locale.locale}</span>
                  <CompletenessBar
                    percent={percentForLocale(status, locale.locale)}
                    unavailable={status.kind === "error"}
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {keys.map((keyName, row) => (
              <GridBodyRow
                key={keyName}
                keyName={keyName}
                row={row}
                locales={locales}
                position={safePosition}
                onActivate={onSelectKey}
                onArrow={handleArrow}
                onFocusCell={handleFocusCell}
                registerCell={registerCell}
              />
            ))}
          </tbody>
        </table>
      </TableCard>
      {capped.truncated ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Showing the first {MAX_RENDERED_KEYS} of {capped.totalMatches} keys. Switch to the List
          view to filter.
        </p>
      ) : null}
    </>
  );
}
