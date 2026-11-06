import {
  AccordionItem,
  Badge,
  Button,
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
import { useEffect, useMemo, useRef, useState } from "react";
import { type StatusData, type StatusRow, sortWorstFirst } from "../client/coverage.js";
import { errorDetail } from "../client/error-copy.js";
import { provenanceSummaryParts } from "../client/provenance-view.js";
import { routeHash } from "../client/routes.js";
import type { RefreshableView, StructuredError } from "../client/state.js";
import { formatCount } from "../client/ui-format.js";
import { ErrorMessage } from "./ErrorMessage.js";
import { cn } from "./lib/cn.js";
import { ScrollHint } from "./ScrollHint.js";
import { useHorizontalOverflow } from "./use-horizontal-overflow.js";
import type { LockLocaleState, LockView } from "./use-lock-state.js";

type LoadedLock = Extract<LockView, { readonly kind: "loaded" }>;

export const INITIAL_LOCALE_ROWS = 10;

const ROW_LINK =
  "inline-flex min-h-8 items-center rounded-sm px-1.5 text-sm text-foreground underline-offset-2 hover:underline focus-visible:underline focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring max-md:min-h-11";

const LOCALE_COLUMN = "w-28 min-w-28 max-w-28 md:w-40 md:min-w-40 md:max-w-40";

const LOCALE_HEAD = cn(
  LOCALE_COLUMN,
  "sticky start-0 z-10 whitespace-nowrap bg-(--surface-table-head) max-md:border-e max-md:border-(--border-default)",
);

const LOCALE_CELL = cn(
  LOCALE_COLUMN,
  "sticky start-0 z-10 bg-card group-hover:bg-(--surface-row-hover) max-md:border-e max-md:border-(--border-default)",
);

function lockCell(lock: LoadedLock, locale: string): ReactNode {
  const entry = lock.locales.find((candidate) => candidate.locale === locale);
  if (entry === undefined) {
    return <Badge tone="neutral">Not recorded</Badge>;
  }
  const drift = entry.missing > 0 || entry.stale > 0;
  return <Badge tone={drift ? "warning" : "success"}>{drift ? "Drift" : "In step"}</Badge>;
}

function RowLinks({ locale }: { readonly locale: string }): ReactNode {
  return (
    <span className="-ms-1.5 flex items-center gap-1 whitespace-nowrap" data-row-links="">
      <a
        href={routeHash({ page: "translations", params: { locale } })}
        className={ROW_LINK}
        data-row-link=""
      >
        Translations<span className="sr-only"> for {locale}</span>
      </a>
      <a
        href={routeHash({ page: "review", params: { locale } })}
        className={ROW_LINK}
        data-row-link=""
      >
        Review<span className="sr-only"> for {locale}</span>
      </a>
    </span>
  );
}

function LocaleRow({ row, lock }: { readonly row: StatusRow; readonly lock: LockView }): ReactNode {
  const total = row.missing + row.stale + row.upToDate;
  return (
    <TableRow className="group">
      <TableCell className={LOCALE_CELL}>
        <span dir="ltr" data-locale-tag="" className="block font-mono font-semibold wrap-anywhere">
          {row.locale}
        </span>
      </TableCell>
      <TableCell>
        <span className="block min-w-40 max-w-60">
          <span
            className="mb-1 flex items-baseline justify-between gap-3 text-xs tabular-nums"
            data-figure=""
          >
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
      <TableCell>
        <RowLinks locale={row.locale} />
      </TableCell>
    </TableRow>
  );
}

function ProvenanceCounts({
  summary,
}: {
  readonly summary: LockLocaleState["provenance"];
}): ReactNode {
  return (
    <ul className="m-0 flex min-w-40 list-none flex-wrap gap-x-3 gap-y-0.5 p-0">
      {provenanceSummaryParts(summary).map((part) => (
        <li key={part} className="whitespace-nowrap">
          {part}
        </li>
      ))}
    </ul>
  );
}

function LockDetail({ locales }: { readonly locales: readonly LockLocaleState[] }): ReactNode {
  const regionRef = useRef<HTMLDivElement>(null);
  const overflows = useHorizontalOverflow(regionRef);
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
      <ScrollHint targetRef={regionRef} className="mb-2" />
      <TableCard
        aria-label="Lock file locales"
        ref={regionRef}
        tabIndex={overflows ? 0 : undefined}
      >
        <Table>
          <TableHead>
            <tr>
              <TableHeaderCell className="whitespace-nowrap">Locale</TableHeaderCell>
              <TableHeaderCell numeric>Recorded keys</TableHeaderCell>
              <TableHeaderCell numeric className="whitespace-nowrap">
                Missing
              </TableHeaderCell>
              <TableHeaderCell numeric className="whitespace-nowrap">
                Stale
              </TableHeaderCell>
              <TableHeaderCell numeric className="whitespace-nowrap">
                Up to date
              </TableHeaderCell>
              <TableHeaderCell>Provenance</TableHeaderCell>
            </tr>
          </TableHead>
          <TableBody>
            {locales.map((locale) => (
              <TableRow key={locale.locale}>
                <TableCell mono dir="ltr">
                  {locale.locale}
                </TableCell>
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
      </TableCard>
    </AccordionItem>
  );
}

function CoverageTable({
  data,
  lock,
}: {
  readonly data: StatusData;
  readonly lock: LockView;
}): ReactNode {
  const coverageRef = useRef<HTMLDivElement>(null);
  const overflows = useHorizontalOverflow(coverageRef);
  const [showAll, setShowAll] = useState(false);
  const focusFirstRevealed = useRef(false);
  const rows = useMemo(() => sortWorstFirst(data.rows), [data.rows]);
  const visible = showAll ? rows : rows.slice(0, INITIAL_LOCALE_ROWS);

  useEffect(() => {
    if (showAll && focusFirstRevealed.current) {
      focusFirstRevealed.current = false;
      coverageRef.current
        ?.querySelectorAll("tbody tr")
        [INITIAL_LOCALE_ROWS]?.querySelector<HTMLAnchorElement>("a")
        ?.focus();
    }
  }, [showAll]);

  return (
    <>
      <ScrollHint targetRef={coverageRef} className="mb-2" />
      <TableCard
        aria-label="Locale coverage"
        ref={coverageRef}
        tabIndex={overflows ? 0 : undefined}
      >
        <Table>
          <TableHead>
            <tr>
              <TableHeaderCell className={LOCALE_HEAD}>Locale</TableHeaderCell>
              <TableHeaderCell className="whitespace-nowrap">Coverage</TableHeaderCell>
              <TableHeaderCell numeric className="whitespace-nowrap">
                Missing
              </TableHeaderCell>
              <TableHeaderCell numeric className="whitespace-nowrap">
                Stale
              </TableHeaderCell>
              <TableHeaderCell numeric className="whitespace-nowrap">
                Up to date
              </TableHeaderCell>
              {lock.kind === "loaded" ? (
                <TableHeaderCell className="whitespace-nowrap">Lock</TableHeaderCell>
              ) : null}
              <TableHeaderCell className="whitespace-nowrap">Open</TableHeaderCell>
            </tr>
          </TableHead>
          <TableBody>
            {visible.map((row) => (
              <LocaleRow key={row.locale} row={row} lock={lock} />
            ))}
          </TableBody>
        </Table>
      </TableCard>
      {rows.length > visible.length ? (
        <div className="mt-3">
          <Button
            onClick={() => {
              focusFirstRevealed.current = true;
              setShowAll(true);
            }}
          >
            Show all {rows.length} locales
          </Button>
        </div>
      ) : null}
    </>
  );
}

const SEE_ABOVE = "See the error above.";

function failureOf(view: RefreshableView<StatusData>): StructuredError | undefined {
  if (view.kind === "error") {
    return view.error;
  }
  return view.kind === "data" && view.stale ? view.error : undefined;
}

function StatusBlock({
  status,
  lock,
  hideCode,
}: {
  readonly status: RefreshableView<StatusData>;
  readonly lock: LockView;
  readonly hideCode: string | undefined;
}): ReactNode {
  const error = failureOf(status);
  const hidden = error !== undefined && error.code === hideCode;
  if (status.kind === "loading") {
    return (
      <div role="status">
        <span className="sr-only">Loading locale coverage…</span>
        <TableSkeleton />
      </div>
    );
  }
  if (status.kind === "error") {
    return hidden ? (
      <p className="text-sm text-muted-foreground">Locale coverage is unavailable. {SEE_ABOVE}</p>
    ) : (
      <ErrorMessage error={status.error} detail={errorDetail(status.error)} />
    );
  }
  return (
    <>
      {status.stale && !hidden ? (
        <ErrorMessage error={status.error} prefix="Showing the last known coverage." />
      ) : null}
      <CoverageTable data={status.data} lock={lock} />
    </>
  );
}

function LockBlock({
  lock,
  hideCode,
}: {
  readonly lock: LockView;
  readonly hideCode: string | undefined;
}): ReactNode {
  if (lock.kind === "no-lock") {
    return (
      <p className="mt-3 text-sm text-muted-foreground">
        No lock file yet. It is written after the first successful translate run.
      </p>
    );
  }
  if (lock.kind === "error") {
    return lock.error.code === hideCode ? (
      <p className="mt-3 text-sm text-muted-foreground">Lock state is unavailable. {SEE_ABOVE}</p>
    ) : (
      <div className="mt-3">
        <ErrorMessage error={lock.error} detail={errorDetail(lock.error)} />
      </div>
    );
  }
  if (lock.kind === "loading") {
    return null;
  }
  return (
    <>
      {lock.staleError !== undefined && lock.staleError.code !== hideCode ? (
        <div className="mt-3">
          <ErrorMessage error={lock.staleError} prefix="Showing the last known lock file." />
        </div>
      ) : null}
      <LockDetail locales={lock.locales} />
    </>
  );
}

export function LocalesSection({
  status,
  lock,
  hideCode,
}: {
  readonly status: RefreshableView<StatusData>;
  readonly lock: LockView;
  readonly hideCode?: string | undefined;
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
      <StatusBlock status={status} lock={lock} hideCode={hideCode} />
      <LockBlock lock={lock} hideCode={hideCode} />
    </PageSection>
  );
}
