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
import { useRef } from "react";
import type { StatusData } from "../client/coverage.js";
import type { DiffLocale } from "../client/diff-view.js";
import { deriveKeyLocaleStatus, keyLocaleStatus } from "../client/diff-view.js";
import type { KeyStatusIndex } from "../client/key-status-filter.js";
import type { LocaleValuesData } from "../client/locale-values.js";
import { sourceTextFor } from "../client/locale-values.js";
import type { RefreshableView } from "../client/state.js";
import { ErrorMessage } from "./ErrorMessage.js";
import { cellName, KeyStatusCell, MarkerTip } from "./KeyStatusCell.js";
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

const ROW_FILL = cn(
  "bg-card group-hover:bg-(--surface-row-hover)",
  "group-data-[selected]:bg-(--surface-hover)",
);

const HEAD_CELL = "sticky top-0 z-20 bg-(--surface-table-head)";

const KEY_COLUMN = "w-28 min-w-28 md:w-60 md:min-w-60";

const KEY_HEAD = cn(HEAD_CELL, "start-0 z-30", KEY_COLUMN);

const KEY_CELL = cn(
  tableClasses.td,
  SEAM,
  ROW_FILL,
  KEY_COLUMN,
  "sticky start-0 z-10 h-12 py-0 text-start font-mono text-sm font-semibold whitespace-nowrap",
);

const KEY_TEXT = "block max-w-[5.5rem] truncate md:max-w-[13.5rem]";

const BODY_CELL = cn(SEAM, "h-12 py-0");

const SOURCE_COLUMN = "hidden md:table-cell";

const STOP =
  "block w-full rounded-(--radius-sm) p-1 text-start focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring";

const KEY_STOP =
  "-mx-1 block max-w-[6rem] truncate rounded-(--radius-sm) px-1 py-1 text-start focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring md:max-w-[14rem]";

const REGION = "scroll-ps-28 md:scroll-ps-60 md:max-h-[calc(100dvh-12rem)] md:overflow-y-auto";

const MATRIX_REGION = cn(REGION, "scroll-pt-16");

const ENTRIES_REGION = cn(REGION, "scroll-pt-11");

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
    <div className="mt-1 flex items-center gap-x-2 font-sans text-xs max-md:flex-wrap font-normal normal-case tracking-normal text-muted-foreground">
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
  const cardRef = useRef<HTMLDivElement>(null);
  const roving = useRovingTable({ rowCount: keys.length, colCount: locales.length }, onSelectKey);

  return (
    <>
      {coverage.kind === "data" && coverage.stale && (
        <ErrorMessage error={coverage.error} prefix="Showing the last known coverage." />
      )}
      <TableCard aria-label="Keys table" className={MATRIX_REGION} ref={cardRef}>
        <Table
          aria-label="Key status by locale"
          role="grid"
          className="border-separate border-spacing-0"
          {...roving.tableProps}
        >
          <TableHead>
            <tr>
              <TableHeaderCell scope="col" className={cn(KEY_HEAD, "h-16")}>
                Key
              </TableHeaderCell>
              <TableHeaderCell
                scope="col"
                className={cn(HEAD_CELL, SOURCE_COLUMN, "h-16 w-56 min-w-56")}
              >
                Source
              </TableHeaderCell>
              {locales.map((locale) => (
                <TableHeaderCell
                  key={locale.locale}
                  scope="col"
                  className={cn(HEAD_CELL, "h-16 w-[10.5rem] min-w-[10.5rem] md:w-44 md:min-w-44")}
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
                  <span className={KEY_TEXT} title={key}>
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
                        <button
                          type="button"
                          className={STOP}
                          aria-label={cellName(key, cell.locale, cell.status, held)}
                          {...roving.stopProps(row, col)}
                        >
                          <KeyStatusCell status={cell.status} held={held} announce={false} />
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
      <ScrollHint targetRef={cardRef} />
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
  const cardRef = useRef<HTMLDivElement>(null);
  const roving = useRovingTable({ rowCount: keys.length, colCount: 1 }, onSelectKey);
  const values = localeValues.find((entry) => entry.locale === locale)?.values;

  return (
    <>
      <TableCard aria-label="Keys table" className={ENTRIES_REGION} ref={cardRef}>
        <Table
          aria-label={`Keys in ${locale}`}
          role="grid"
          className="border-separate border-spacing-0"
          {...roving.tableProps}
        >
          <TableHead>
            <tr>
              <TableHeaderCell scope="col" className={cn(KEY_HEAD, "h-11")}>
                Key
              </TableHeaderCell>
              <TableHeaderCell scope="col" className={cn(HEAD_CELL, "h-11 w-60 min-w-60")}>
                Source
              </TableHeaderCell>
              <TableHeaderCell scope="col" className={cn(HEAD_CELL, "h-11 w-60 min-w-60")}>
                Translation
              </TableHeaderCell>
              <TableHeaderCell
                scope="col"
                className={cn(HEAD_CELL, "h-11 w-[9.5rem] min-w-[9.5rem]")}
              >
                Status
              </TableHeaderCell>
              <TableHeaderCell scope="col" className={cn(HEAD_CELL, "h-11 w-40 min-w-40")}>
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
                    <MarkerTip held={held} side="end">
                      <button
                        type="button"
                        className={KEY_STOP}
                        title={key}
                        {...roving.stopProps(row, 0)}
                      >
                        {key}
                      </button>
                    </MarkerTip>
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
      <ScrollHint targetRef={cardRef} />
    </>
  );
}

export function KeysTable(props: KeysTableProps): ReactNode {
  const { locale, ...rest } = props;
  return locale === "" ? <MatrixTable {...rest} /> : <EntriesTable {...props} />;
}
