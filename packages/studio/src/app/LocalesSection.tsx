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
import { useRef } from "react";
import type { StatusData, StatusRow } from "../client/coverage.js";
import { provenanceSummaryParts } from "../client/provenance-view.js";
import { routeHash } from "../client/routes.js";
import type { RefreshableView } from "../client/state.js";
import { formatCount } from "../client/ui-format.js";
import { ErrorMessage } from "./ErrorMessage.js";
import { ScrollHint } from "./ScrollHint.js";
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

const ROW_LINK =
  "inline-flex min-h-8 items-center rounded-sm px-1.5 text-sm text-(--accent) underline underline-offset-2 hover:text-(--text-strong) focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring max-md:min-h-11";

function RowLinks({ locale }: { readonly locale: string }): ReactNode {
  return (
    <span className="-ms-1.5 flex flex-wrap items-center gap-x-1">
      <a href={routeHash({ page: "translations", params: { locale } })} className={ROW_LINK}>
        Translations<span className="sr-only"> for {locale}</span>
      </a>
      <a href={routeHash({ page: "review", params: { locale } })} className={ROW_LINK}>
        Review<span className="sr-only"> for {locale}</span>
      </a>
    </span>
  );
}

function LocaleRow({ row, lock }: { readonly row: StatusRow; readonly lock: LockView }): ReactNode {
  const total = row.missing + row.stale + row.upToDate;
  return (
    <TableRow>
      <TableCell className="min-w-28 max-w-56">
        <span dir="ltr" data-locale-tag="" className="block font-mono font-semibold wrap-anywhere">
          {row.locale}
        </span>
        <RowLinks locale={row.locale} />
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
  const coverageRef = useRef<HTMLDivElement>(null);
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
          <TableCard aria-label="Locale coverage" ref={coverageRef}>
            <Table>
              <TableHead>
                <tr>
                  <TableHeaderCell className="whitespace-nowrap">Locale</TableHeaderCell>
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
                </tr>
              </TableHead>
              <TableBody>
                {status.data.rows.map((row) => (
                  <LocaleRow key={row.locale} row={row} lock={lock} />
                ))}
              </TableBody>
            </Table>
          </TableCard>
          <ScrollHint targetRef={coverageRef} />
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
