import {
  AccordionItem,
  Badge,
  Icon,
  MonoValue,
  PageSection,
  ProgressBar,
  Table,
  TableBody,
  TableCard,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  TableSkeleton,
} from "@verbatra/ui";
import type { ReactNode } from "react";
import type { StatusData, StatusRow } from "../client/coverage.js";
import { provenanceSummaryParts } from "../client/provenance-view.js";
import type { RefreshableView } from "../client/state.js";
import { formatCount } from "../client/ui-format.js";
import { ErrorMessage } from "./ErrorMessage.js";
import type { LockLocaleState, LockView } from "./use-lock-state.js";

type LoadedLock = Extract<LockView, { readonly kind: "loaded" }>;

function lockCell(lock: LoadedLock, locale: string): ReactNode {
  const entry = lock.locales.find((candidate) => candidate.locale === locale);
  if (entry === undefined) {
    return <Badge tone="neutral">Not recorded</Badge>;
  }
  const drift = entry.missing > 0 || entry.stale > 0;
  return <Badge tone={drift ? "warning" : "success"}>{drift ? "Drift" : "In step"}</Badge>;
}

function LocaleRow({ row, lock }: { readonly row: StatusRow; readonly lock: LockView }): ReactNode {
  const total = row.missing + row.stale + row.upToDate;
  return (
    <TableRow>
      <TableCell mono className="font-semibold">
        {row.locale}
      </TableCell>
      <TableCell>
        <span className="block min-w-[160px] max-w-[240px]">
          <span className="mb-1 flex items-baseline justify-between gap-3 font-mono text-xs tabular-nums">
            <span className="font-semibold text-foreground">{row.percent}%</span>
            <span className="text-muted-foreground">
              {formatCount(row.upToDate)} / {formatCount(total)} keys
            </span>
          </span>
          <ProgressBar percent={row.percent} />
        </span>
      </TableCell>
      <TableCell numeric>{row.missing}</TableCell>
      <TableCell numeric>{row.stale}</TableCell>
      <TableCell numeric>{row.upToDate}</TableCell>
      {lock.kind === "loaded" ? <TableCell>{lockCell(lock, row.locale)}</TableCell> : null}
    </TableRow>
  );
}

function ProvenanceCounts({
  summary,
}: {
  readonly summary: LockLocaleState["provenance"];
}): ReactNode {
  return (
    <ul className="m-0 flex min-w-[160px] list-none flex-wrap gap-x-3 gap-y-0.5 p-0">
      {provenanceSummaryParts(summary).map((part) => (
        <li key={part} className="whitespace-nowrap">
          {part}
        </li>
      ))}
    </ul>
  );
}

function LockDetail({ locales }: { readonly locales: readonly LockLocaleState[] }): ReactNode {
  return (
    <AccordionItem
      className="mt-4"
      summaryClassName="font-sans text-sm font-medium"
      summary={
        <span className="inline-flex items-center gap-2">
          <Icon name="lock" size={14} className="text-muted-foreground" />
          Lock file details
        </span>
      }
    >
      <p className="mb-3 text-sm text-muted-foreground">
        The lock file&apos;s own record: keys per recorded locale, and drift measured against the
        current files. Provenance counts who wrote each current value, from{" "}
        <MonoValue>verbatra.provenance.json</MonoValue>.
      </p>
      <div className="overflow-x-auto">
        <Table>
          <TableHead>
            <tr>
              <TableHeaderCell>Locale</TableHeaderCell>
              <TableHeaderCell numeric>Recorded keys</TableHeaderCell>
              <TableHeaderCell numeric>Missing</TableHeaderCell>
              <TableHeaderCell numeric>Stale</TableHeaderCell>
              <TableHeaderCell numeric>Up to date</TableHeaderCell>
              <TableHeaderCell>Provenance</TableHeaderCell>
            </tr>
          </TableHead>
          <TableBody>
            {locales.map((locale) => (
              <TableRow key={locale.locale}>
                <TableCell mono>{locale.locale}</TableCell>
                <TableCell numeric>{locale.keyCount}</TableCell>
                <TableCell numeric>{locale.missing}</TableCell>
                <TableCell numeric>{locale.stale}</TableCell>
                <TableCell numeric>{locale.upToDate}</TableCell>
                <TableCell>
                  <ProvenanceCounts summary={locale.provenance} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </AccordionItem>
  );
}

export function LocalesSection({
  status,
  lock,
}: {
  readonly status: RefreshableView<StatusData>;
  readonly lock: LockView;
}): ReactNode {
  return (
    <PageSection
      title="Locales"
      meta={
        lock.kind === "loaded" ? (
          <Badge tone="neutral" verbatim>
            Lock v{lock.version}
          </Badge>
        ) : undefined
      }
    >
      {status.kind === "loading" ? (
        <div role="status">
          <span className="sr-only">Loading locale coverage…</span>
          <TableSkeleton />
        </div>
      ) : null}
      {status.kind === "error" ? <ErrorMessage error={status.error} /> : null}
      {status.kind === "data" ? (
        <>
          {status.stale && (
            <ErrorMessage error={status.error} prefix="Showing the last known status." />
          )}
          <TableCard>
            <Table>
              <TableHead>
                <tr>
                  <TableHeaderCell>Locale</TableHeaderCell>
                  <TableHeaderCell>Coverage</TableHeaderCell>
                  <TableHeaderCell numeric>Missing</TableHeaderCell>
                  <TableHeaderCell numeric>Stale</TableHeaderCell>
                  <TableHeaderCell numeric>Up to date</TableHeaderCell>
                  {lock.kind === "loaded" ? <TableHeaderCell>Lock</TableHeaderCell> : null}
                </tr>
              </TableHead>
              <TableBody>
                {status.data.rows.map((row) => (
                  <LocaleRow key={row.locale} row={row} lock={lock} />
                ))}
              </TableBody>
            </Table>
          </TableCard>
          <p className="mt-2 text-xs text-muted-foreground md:hidden">
            Scroll sideways to see every column.
          </p>
        </>
      ) : null}
      {lock.kind === "no-lock" ? (
        <p className="mt-3 text-sm text-muted-foreground">
          No lock file yet. It is written after the first successful translate run.
        </p>
      ) : null}
      {lock.kind === "error" ? (
        <div className="mt-3">
          <ErrorMessage error={lock.error} />
        </div>
      ) : null}
      {lock.kind === "loaded" ? <LockDetail locales={lock.locales} /> : null}
    </PageSection>
  );
}
