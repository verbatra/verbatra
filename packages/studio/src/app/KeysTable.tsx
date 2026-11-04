import {
  ProgressBar,
  Table,
  TableBody,
  TableCard,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  tableClasses,
} from "@verbatra/ui";
import type { ReactNode } from "react";
import type { StatusData } from "../client/coverage.js";
import type { DiffLocale } from "../client/diff-view.js";
import { deriveKeyLocaleStatus, keyLocaleStatus } from "../client/diff-view.js";
import type { KeyStatusIndex } from "../client/key-status-filter.js";
import type { LocaleValuesData } from "../client/locale-values.js";
import { sourceTextFor } from "../client/locale-values.js";
import type { RefreshableView } from "../client/state.js";
import { ErrorMessage } from "./ErrorMessage.js";
import { KeyStatusCell, MarkerTip } from "./KeyStatusCell.js";
import { cn } from "./lib/cn.js";
import { ProvenanceBadge } from "./ProvenanceBadge.js";
import { ScrollHint } from "./ScrollHint.js";
import { TranslationValue } from "./TranslationValue.js";
import { useRovingTable } from "./use-roving-table.js";
import { useStatusData } from "./use-status-data.js";

export interface KeysTableProps {
  readonly locales: readonly DiffLocale[];
  readonly keys: readonly string[];
  readonly locale: string;
  readonly index: KeyStatusIndex;
  readonly localeValues: LocaleValuesData;
  readonly selectedKey: string | null;
  readonly refreshToken: number;
  readonly onSelectKey: (key: string) => void;
}

const SEAM = "border-b border-(--border-default)";

const HEAD_FILL = "bg-[color-mix(in_srgb,var(--surface-muted)_60%,var(--surface-tile))]";

const ROW_FILL = cn(
  "bg-card group-hover:bg-[color-mix(in_srgb,var(--surface-hover)_40%,var(--surface-tile))]",
  "group-data-[selected]:bg-(--surface-hover)",
);

const HEAD_CELL = cn("sticky top-0 z-20", HEAD_FILL);

const KEY_HEAD = cn(HEAD_CELL, "start-0 z-30 w-60 min-w-60");

const KEY_CELL = cn(
  tableClasses.td,
  SEAM,
  ROW_FILL,
  "sticky start-0 z-10 h-12 w-60 min-w-60 py-0 text-start font-mono text-sm font-semibold whitespace-nowrap",
);

const BODY_CELL = cn(SEAM, "h-12 py-0");

const SOURCE_COLUMN = "hidden md:table-cell";

const STOP =
  "block w-full rounded-(--radius-sm) p-1 text-start focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring";

const KEY_STOP =
  "-mx-1 block max-w-[13.5rem] truncate rounded-(--radius-sm) px-1 py-1 text-start focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring";

const REGION = "max-h-[calc(100dvh-12rem)] overflow-y-auto";

const WITHOUT_ORIGIN: ReadonlySet<string> = new Set(["missing", "orphaned", "absent"]);

function percentForLocale(status: RefreshableView<StatusData>, locale: string): number | null {
  if (status.kind !== "data") {
    return null;
  }
  return status.data.rows.find((row) => row.locale === locale)?.percent ?? null;
}

function Coverage({
  percent,
  unavailable,
}: {
  readonly percent: number | null;
  readonly unavailable: boolean;
}): ReactNode {
  if (percent === null) {
    return (
      <span className="mt-1 block font-sans text-xs font-normal normal-case tracking-normal text-muted-foreground">
        {unavailable ? "Coverage unavailable" : "Loading coverage"}
      </span>
    );
  }
  return (
    <div className="mt-1 flex items-center gap-2 font-sans text-xs font-normal normal-case tracking-normal text-muted-foreground">
      <ProgressBar percent={percent} className="w-[60px] flex-none" />
      <span className="whitespace-nowrap">{percent}% up to date</span>
    </div>
  );
}

function SourceText({
  value,
  className,
}: {
  readonly value: string | undefined;
  readonly className: string;
}): ReactNode {
  if (value === undefined) {
    return <span className="text-muted-foreground">No source text</span>;
  }
  return (
    <TranslationValue
      value={value}
      title={value}
      className={cn("block truncate text-muted-foreground", className)}
      data-source=""
    />
  );
}

function MatrixTable({
  locales,
  keys,
  index,
  localeValues,
  selectedKey,
  refreshToken,
  onSelectKey,
}: Omit<KeysTableProps, "locale">): ReactNode {
  const coverage = useStatusData(refreshToken);
  const roving = useRovingTable({ rowCount: keys.length, colCount: locales.length }, onSelectKey);

  return (
    <>
      {coverage.kind === "data" && coverage.stale && (
        <ErrorMessage error={coverage.error} prefix="Showing the last known coverage." />
      )}
      <TableCard aria-label="Keys table" className={REGION}>
        <Table
          aria-label="Key status by locale"
          role="grid"
          className="border-separate border-spacing-0"
          {...roving.tableProps}
        >
          <TableHead>
            <tr>
              <TableHeaderCell scope="col" className={KEY_HEAD}>
                Key
              </TableHeaderCell>
              <TableHeaderCell
                scope="col"
                className={cn(HEAD_CELL, SOURCE_COLUMN, "w-56 min-w-56")}
              >
                Source
              </TableHeaderCell>
              {locales.map((locale) => (
                <TableHeaderCell
                  key={locale.locale}
                  scope="col"
                  className={cn(HEAD_CELL, "w-44 min-w-44")}
                >
                  <span className="font-mono">{locale.locale}</span>
                  <Coverage
                    percent={percentForLocale(coverage, locale.locale)}
                    unavailable={coverage.kind === "error"}
                  />
                </TableHeaderCell>
              ))}
            </tr>
          </TableHead>
          <TableBody>
            {keys.map((key, row) => (
              <TableRow key={key} data-key={key} selected={key === selectedKey} className="group">
                <th scope="row" className={KEY_CELL}>
                  <span className="block max-w-[13.5rem] truncate" title={key}>
                    {key}
                  </span>
                </th>
                <TableCell className={cn(BODY_CELL, SOURCE_COLUMN)}>
                  <SourceText
                    value={sourceTextFor(localeValues, key)}
                    className="max-w-[12.5rem]"
                  />
                </TableCell>
                {deriveKeyLocaleStatus(locales, key).map((cell, col) => {
                  const held = index.get(cell.locale)?.get(key);
                  return (
                    <TableCell key={cell.locale} className={cn(BODY_CELL, "px-2")}>
                      <MarkerTip held={held}>
                        <button type="button" className={STOP} {...roving.stopProps(row, col)}>
                          <span className="sr-only">{`${key} in ${cell.locale}: `}</span>
                          <KeyStatusCell status={cell.status} held={held} />
                        </button>
                      </MarkerTip>
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableCard>
      <ScrollHint />
    </>
  );
}

function EntriesTable({
  locales,
  keys,
  locale,
  index,
  localeValues,
  selectedKey,
  onSelectKey,
}: Omit<KeysTableProps, "refreshToken">): ReactNode {
  const roving = useRovingTable({ rowCount: keys.length, colCount: 1 }, onSelectKey);
  const values = localeValues.find((entry) => entry.locale === locale)?.values;

  return (
    <>
      <TableCard aria-label="Keys table" className={REGION}>
        <Table
          aria-label={`Keys in ${locale}`}
          role="grid"
          className="border-separate border-spacing-0"
          {...roving.tableProps}
        >
          <TableHead>
            <tr>
              <TableHeaderCell scope="col" className={KEY_HEAD}>
                Key
              </TableHeaderCell>
              <TableHeaderCell scope="col" className={cn(HEAD_CELL, "w-60 min-w-60")}>
                Source
              </TableHeaderCell>
              <TableHeaderCell scope="col" className={cn(HEAD_CELL, "w-60 min-w-60")}>
                Translation
              </TableHeaderCell>
              <TableHeaderCell scope="col" className={cn(HEAD_CELL, "w-[9.5rem] min-w-[9.5rem]")}>
                Status
              </TableHeaderCell>
              <TableHeaderCell scope="col" className={cn(HEAD_CELL, "w-40 min-w-40")}>
                Origin
              </TableHeaderCell>
            </tr>
          </TableHead>
          <TableBody>
            {keys.map((key, row) => {
              const status = keyLocaleStatus(locales, key, locale);
              const held = index.get(locale)?.get(key);
              const pair = values?.[key];
              return (
                <TableRow key={key} data-key={key} selected={key === selectedKey} className="group">
                  <th scope="row" className={KEY_CELL}>
                    <button
                      type="button"
                      className={KEY_STOP}
                      title={key}
                      {...roving.stopProps(row, 0)}
                    >
                      {key}
                    </button>
                  </th>
                  <TableCell className={BODY_CELL}>
                    <SourceText
                      value={pair?.source ?? sourceTextFor(localeValues, key)}
                      className="max-w-[13.5rem]"
                    />
                  </TableCell>
                  <TableCell className={BODY_CELL}>
                    {pair?.target === undefined ? (
                      <span className="text-muted-foreground">No translation</span>
                    ) : (
                      <TranslationValue
                        value={pair.target}
                        locale={locale}
                        title={pair.target}
                        className="block max-w-[13.5rem] truncate"
                        data-translation=""
                      />
                    )}
                  </TableCell>
                  <TableCell className={BODY_CELL}>
                    <MarkerTip held={held}>
                      <KeyStatusCell status={status} held={held} />
                    </MarkerTip>
                  </TableCell>
                  <TableCell className={BODY_CELL}>
                    {WITHOUT_ORIGIN.has(status) ? null : (
                      <ProvenanceBadge provenance={pair?.provenance} />
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableCard>
      <ScrollHint />
    </>
  );
}

export function KeysTable(props: KeysTableProps): ReactNode {
  const { locale, ...rest } = props;
  return locale === "" ? <MatrixTable {...rest} /> : <EntriesTable {...props} />;
}
