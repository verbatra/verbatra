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
import { deriveKeyLocaleStatus } from "../client/diff-view.js";
import type { KeyStatusIndex } from "../client/key-status-filter.js";
import type { LocaleValuesData } from "../client/locale-values.js";
import { sourceTextFor } from "../client/locale-values.js";
import type { RefreshableView } from "../client/state.js";
import { ErrorMessage } from "./ErrorMessage.js";
import { KeyStatusCell } from "./KeyStatusCell.js";
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
  readonly refreshToken: number;
  readonly onSelectKey: (key: string) => void;
}

const KEY_CELL = cn(
  tableClasses.td,
  "sticky start-0 bg-card text-start font-mono text-sm font-semibold whitespace-nowrap",
);

const STOP =
  "block w-full rounded-(--radius-sm) p-1 text-start focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring";

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
      <span className="mt-1 block text-xs font-normal normal-case tracking-normal text-muted-foreground">
        {unavailable ? "Coverage unavailable" : "Loading coverage"}
      </span>
    );
  }
  return (
    <div className="mt-1 flex items-center gap-2 text-xs font-normal normal-case tracking-normal text-muted-foreground">
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
      <TableCard aria-label="Keys table">
        <Table aria-label="Key status by locale" role="grid" {...roving.tableProps}>
          <TableHead>
            <tr>
              <TableHeaderCell scope="col" className="min-w-[160px]">
                Key
              </TableHeaderCell>
              <TableHeaderCell scope="col">Source</TableHeaderCell>
              {locales.map((locale) => (
                <TableHeaderCell key={locale.locale} scope="col" className="min-w-[140px]">
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
              <TableRow key={key} data-key={key}>
                <th scope="row" className={KEY_CELL}>
                  {key}
                </th>
                <TableCell>
                  <SourceText value={sourceTextFor(localeValues, key)} className="max-w-[14rem]" />
                </TableCell>
                {deriveKeyLocaleStatus(locales, key).map((cell, col) => (
                  <TableCell key={cell.locale} className="px-2 py-1">
                    <button type="button" className={STOP} {...roving.stopProps(row, col)}>
                      <span className="sr-only">{`${key} in ${cell.locale}: `}</span>
                      <KeyStatusCell status={cell.status} held={index.get(cell.locale)?.get(key)} />
                    </button>
                  </TableCell>
                ))}
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
  onSelectKey,
}: Omit<KeysTableProps, "refreshToken">): ReactNode {
  const roving = useRovingTable({ rowCount: keys.length, colCount: 1 }, onSelectKey);
  const values = localeValues.find((entry) => entry.locale === locale)?.values;

  return (
    <>
      <TableCard aria-label="Keys table">
        <Table aria-label={`Keys in ${locale}`} role="grid" {...roving.tableProps}>
          <TableHead>
            <tr>
              <TableHeaderCell scope="col" className="min-w-[160px]">
                Key
              </TableHeaderCell>
              <TableHeaderCell scope="col">Source</TableHeaderCell>
              <TableHeaderCell scope="col">Translation</TableHeaderCell>
              <TableHeaderCell scope="col">Status</TableHeaderCell>
              <TableHeaderCell scope="col">Origin</TableHeaderCell>
            </tr>
          </TableHead>
          <TableBody>
            {keys.map((key, row) => {
              const status =
                deriveKeyLocaleStatus(locales, key).find((cell) => cell.locale === locale)
                  ?.status ?? "absent";
              const pair = values?.[key];
              return (
                <TableRow key={key} data-key={key}>
                  <th scope="row" className={KEY_CELL}>
                    <button type="button" className={STOP} {...roving.stopProps(row, 0)}>
                      {key}
                    </button>
                  </th>
                  <TableCell>
                    <SourceText
                      value={pair?.source ?? sourceTextFor(localeValues, key)}
                      className="max-w-[22rem]"
                    />
                  </TableCell>
                  <TableCell>
                    {pair?.target === undefined ? (
                      <span className="text-muted-foreground">No translation</span>
                    ) : (
                      <TranslationValue
                        value={pair.target}
                        locale={locale}
                        title={pair.target}
                        className="block max-w-[22rem] truncate"
                        data-translation=""
                      />
                    )}
                  </TableCell>
                  <TableCell>
                    <KeyStatusCell status={status} held={index.get(locale)?.get(key)} />
                  </TableCell>
                  <TableCell>
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
