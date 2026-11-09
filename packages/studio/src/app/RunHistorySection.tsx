import type { RunHistoryRecord } from "@verbatra/sdk";
import {
  Badge,
  Button,
  EmptyState,
  PageSection,
  Table,
  TableBody,
  TableCard,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@verbatra/ui";
import type { ReactNode } from "react";
import { useRef, useState } from "react";
import {
  type CostDisplay,
  type CoverageRow,
  costSeries,
  describeCost,
  describeProvider,
  describeTokens,
  describeTrigger,
  formatCost,
  lastKnownCoverage,
  type RunHistoryData,
  type RunHistoryNotice,
  tokenSeries,
  toRunHistoryDisplay,
  totalLocales,
} from "../client/run-history-view.js";
import type { RefreshableView } from "../client/state.js";
import { formatCount, formatTimestamp } from "../client/ui-format.js";
import { ErrorMessage } from "./ErrorMessage.js";
import { Loading } from "./Loading.js";
import { RunHistoryChart } from "./RunHistoryChart.js";
import { ScrollHint } from "./ScrollHint.js";
import { useHorizontalOverflow } from "./use-horizontal-overflow.js";

export const INITIAL_RUN_ROWS = 10;

const PAGE_ROWS = 10;

const COST_TONE: Readonly<Record<CostDisplay["kind"], "success" | "warning" | "neutral">> = {
  priced: "success",
  estimated: "warning",
  "lower-bound": "warning",
  "no-rate": "neutral",
  unknown: "neutral",
  "not-billed": "neutral",
};

function noticeText(notice: RunHistoryNotice): string {
  switch (notice.kind) {
    case "unavailable":
      return notice.reason === "too-large"
        ? "The run history file is over 8 MiB, so it was not read. It is left as it is."
        : "The run history file exists but could not be read as a regular file. It is left as it is, and the list below is not proof that no run happened.";
    case "unreadable-records":
      return `${formatCount(notice.count)} ${notice.count === 1 ? "record" : "records"} could not be read and ${notice.count === 1 ? "is" : "are"} left out. The next recorded run rewrites the file without ${notice.count === 1 ? "it" : "them"}.`;
    case "truncated":
      return `Showing the newest ${formatCount(notice.shown)} of ${formatCount(notice.total)} recorded runs.`;
  }
}

function Notices({ notices }: { readonly notices: readonly RunHistoryNotice[] }): ReactNode {
  if (notices.length === 0) {
    return null;
  }
  return (
    <ul className="m-0 mb-4 flex list-none flex-col gap-2 p-0" data-run-history-notices="">
      {notices.map((notice) => (
        <li
          key={notice.kind}
          role="status"
          className="rounded-lg border-s-[3px] border-warning bg-warning-soft px-4 py-2.5 text-sm text-foreground"
        >
          {noticeText(notice)}
        </li>
      ))}
    </ul>
  );
}

function CostCell({ cost }: { readonly cost: CostDisplay }): ReactNode {
  return (
    <div className="flex min-w-36 flex-col items-start gap-1">
      <Badge tone={COST_TONE[cost.kind]} verbatim>
        {cost.label}
      </Badge>
      {cost.kind === "priced" ? null : (
        <span className="text-xs text-muted-foreground">{cost.hint}</span>
      )}
      {cost.caveats.map((caveat) => (
        <span key={caveat} className="text-xs text-muted-foreground">
          {caveat}
        </span>
      ))}
    </div>
  );
}

function TokensCell({ record }: { readonly record: RunHistoryRecord }): ReactNode {
  const tokens = describeTokens(record);
  if (!tokens.reported) {
    return <span className="text-muted-foreground">not reported</span>;
  }
  return (
    <span className="whitespace-nowrap">
      {formatCount(tokens.input ?? 0)} in / {formatCount(tokens.output ?? 0)} out
    </span>
  );
}

function localeSummary(record: RunHistoryRecord): string {
  const totals = totalLocales(record);
  const parts = [`${formatCount(totals.translated)} translated`];
  if (totals.cacheHits + totals.fuzzyHits > 0) {
    parts.push(`${formatCount(totals.cacheHits + totals.fuzzyHits)} from memory`);
  }
  if (totals.generated > 0) {
    parts.push(`${formatCount(totals.generated)} generated`);
  }
  if (totals.pruned > 0) {
    parts.push(`${formatCount(totals.pruned)} pruned`);
  }
  if (totals.integrityMismatches > 0) {
    parts.push(`${formatCount(totals.integrityMismatches)} refused`);
  }
  if (totals.providerFailures > 0) {
    parts.push(`${formatCount(totals.providerFailures)} failed`);
  }
  return parts.join(", ");
}

function RunsTable({ records }: { readonly records: readonly RunHistoryRecord[] }): ReactNode {
  const [shown, setShown] = useState(INITIAL_RUN_ROWS);
  const regionRef = useRef<HTMLDivElement>(null);
  const overflows = useHorizontalOverflow(regionRef);
  const rows = records.slice(0, shown);

  return (
    <div className="mt-6">
      <ScrollHint targetRef={regionRef} className="mb-2" />
      <TableCard aria-label="Recorded runs" ref={regionRef} tabIndex={overflows ? 0 : undefined}>
        <Table>
          <caption className="sr-only">Recorded runs, newest first</caption>
          <TableHead>
            <tr>
              <TableHeaderCell className="whitespace-nowrap">When</TableHeaderCell>
              <TableHeaderCell>Run</TableHeaderCell>
              <TableHeaderCell>Tokens</TableHeaderCell>
              <TableHeaderCell>Cost</TableHeaderCell>
              <TableHeaderCell>Result</TableHeaderCell>
            </tr>
          </TableHead>
          <TableBody>
            {rows.map((record, index) => (
              <TableRow key={`${record.at}-${index}`}>
                <TableCell className="whitespace-nowrap">
                  <time dateTime={record.at}>{formatTimestamp(record.at)}</time>
                </TableCell>
                <TableCell>
                  <div className="font-medium">{describeTrigger(record)}</div>
                  <div className="text-xs text-muted-foreground">{describeProvider(record)}</div>
                </TableCell>
                <TableCell>
                  <TokensCell record={record} />
                </TableCell>
                <TableCell>
                  <CostCell cost={describeCost(record.cost)} />
                </TableCell>
                <TableCell>{localeSummary(record)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableCard>
      {records.length > shown ? (
        <div className="mt-3">
          <Button onClick={() => setShown((count) => count + PAGE_ROWS)}>Show more runs</Button>
        </div>
      ) : null}
    </div>
  );
}

function CoverageTable({ rows }: { readonly rows: readonly CoverageRow[] }): ReactNode {
  const regionRef = useRef<HTMLDivElement>(null);
  const overflows = useHorizontalOverflow(regionRef);
  if (rows.length === 0) {
    return (
      <p className="m-0 mt-6 text-sm text-muted-foreground">
        No coverage was measured in these runs.
      </p>
    );
  }
  return (
    <div className="mt-6">
      <h3 className="m-0 mb-2 text-sm font-medium text-foreground">Coverage after the run</h3>
      <ScrollHint targetRef={regionRef} className="mb-2" />
      <TableCard
        aria-label="Coverage after the last measured run"
        ref={regionRef}
        tabIndex={overflows ? 0 : undefined}
      >
        <Table>
          <TableHead>
            <tr>
              <TableHeaderCell>Locale</TableHeaderCell>
              <TableHeaderCell numeric>Missing</TableHeaderCell>
              <TableHeaderCell numeric>Stale</TableHeaderCell>
              <TableHeaderCell numeric className="whitespace-nowrap">
                Up to date
              </TableHeaderCell>
              <TableHeaderCell>Measured</TableHeaderCell>
            </tr>
          </TableHead>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.locale}>
                <TableCell mono dir="ltr">
                  {row.locale}
                </TableCell>
                <TableCell numeric>
                  {row.known === undefined ? "-" : formatCount(row.known.missing)}
                </TableCell>
                <TableCell numeric>
                  {row.known === undefined ? "-" : formatCount(row.known.stale)}
                </TableCell>
                <TableCell numeric>
                  {row.known === undefined ? "-" : formatCount(row.known.upToDate)}
                </TableCell>
                <TableCell>
                  {row.known !== undefined && row.measuredInLatestRun ? (
                    <time dateTime={row.known.measuredAt}>
                      {formatTimestamp(row.known.measuredAt)}
                    </time>
                  ) : (
                    <div className="flex flex-col items-start gap-1">
                      <Badge tone="neutral">Not measured in this run</Badge>
                      {row.known === undefined ? null : (
                        <span className="text-xs text-muted-foreground">
                          Last known{" "}
                          <time dateTime={row.known.measuredAt}>
                            {formatTimestamp(row.known.measuredAt)}
                          </time>
                        </span>
                      )}
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableCard>
    </div>
  );
}

function Trends({ records }: { readonly records: readonly RunHistoryRecord[] }): ReactNode {
  const cost = costSeries(records);
  const tokens = tokenSeries(records);
  const chronological = [...records].reverse();
  const costPeak = Math.max(0, ...cost.points.map((point) => point.value ?? 0));
  const tokenPeak = Math.max(0, ...tokens.map((point) => point.value ?? 0));
  const costNotes = [
    cost.points.some((point) => point.hollow)
      ? "A hollow point is an estimate or a lower bound."
      : undefined,
    cost.otherCurrencies > 0
      ? `${formatCount(cost.otherCurrencies)} ${cost.otherCurrencies === 1 ? "run" : "runs"} in another currency ${cost.otherCurrencies === 1 ? "is" : "are"} not drawn.`
      : undefined,
  ].filter((note) => note !== undefined);

  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <RunHistoryChart
        title={cost.currency === undefined ? "Cost per run" : `Cost per run (${cost.currency})`}
        kind="line"
        points={cost.points}
        labels={chronological.map(
          (record) => `${formatTimestamp(record.at)}: ${describeCost(record.cost).label}`,
        )}
        peak={cost.currency === undefined ? "" : formatCost(costPeak, cost.currency)}
        note={costNotes.length === 0 ? undefined : costNotes.join(" ")}
      />
      <RunHistoryChart
        title="Tokens per run"
        kind="bars"
        points={tokens}
        labels={chronological.map((record) => {
          const described = describeTokens(record);
          return `${formatTimestamp(record.at)}: ${described.reported ? formatCount(described.total ?? 0) : "not reported"}`;
        })}
        peak={formatCount(tokenPeak)}
        note="A run with no bar did not report tokens."
      />
    </div>
  );
}

function Body({ data }: { readonly data: RunHistoryData }): ReactNode {
  const display = toRunHistoryDisplay(data);
  return (
    <div data-run-history="">
      <Notices notices={display.notices} />
      {display.empty ? (
        <EmptyState icon="gauge" title="No runs recorded yet">
          A run that translates something, or one retranslation, appears here once it finishes. Dry
          runs and runs that change nothing are not recorded.
        </EmptyState>
      ) : (
        <>
          <Trends records={display.records} />
          <RunsTable records={display.records} />
          <CoverageTable rows={lastKnownCoverage(display.records)} />
        </>
      )}
    </div>
  );
}

function Content({
  view,
  hideCode,
}: {
  readonly view: RefreshableView<RunHistoryData>;
  readonly hideCode: string | undefined;
}): ReactNode {
  if (view.kind === "loading") {
    return <Loading />;
  }
  if (view.kind === "error") {
    return view.error.code === hideCode ? (
      <p className="text-sm text-muted-foreground">
        Run history is unavailable. See the error above.
      </p>
    ) : (
      <ErrorMessage error={view.error} />
    );
  }
  return (
    <>
      {view.stale && view.error.code !== hideCode ? (
        <ErrorMessage error={view.error} prefix="Showing the last known run history." />
      ) : null}
      <Body data={view.data} />
    </>
  );
}

export function RunHistorySection({
  view,
  hideCode,
  className,
}: {
  readonly view: RefreshableView<RunHistoryData>;
  readonly hideCode: string | undefined;
  readonly className?: string;
}): ReactNode {
  return (
    <PageSection title="Run history and cost" {...(className === undefined ? {} : { className })}>
      <Content view={view} hideCode={hideCode} />
    </PageSection>
  );
}
