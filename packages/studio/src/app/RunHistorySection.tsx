import type { RunHistoryRecord } from "@verbatra/sdk";
import {
  Badge,
  Button,
  EmptyState,
  MonoValue,
  PageSection,
  Table,
  TableBody,
  TableCard,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@verbatra/ui";
import type { ReactNode, RefObject } from "react";
import { useEffect, useRef, useState } from "react";
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
  notBilledNote,
  type RunHistoryData,
  type RunHistoryNotice,
  tokenSeries,
  toRunHistoryDisplay,
  totalLocales,
} from "../client/run-history-view.js";
import type { RefreshableView } from "../client/state.js";
import { formatCount, formatShortTimestamp, formatTimestamp } from "../client/ui-format.js";
import { ErrorMessage } from "./ErrorMessage.js";
import { Loading } from "./Loading.js";
import { RunHistoryChart } from "./RunHistoryChart.js";
import { ScrollHint } from "./ScrollHint.js";
import { useHorizontalOverflow } from "./use-horizontal-overflow.js";

export const INITIAL_RUN_ROWS = 10;

const PAGE_ROWS = 10;

const INITIAL_COVERAGE_ROWS = 10;

const WHEN_HEAD =
  "sticky start-0 z-10 border-e border-(--border-default) bg-(--surface-table-head) max-md:whitespace-nowrap";

const RING_ENDS = {
  first:
    "group-focus-visible:shadow-[inset_2px_0_0_0_var(--focus-ring),inset_0_2px_0_0_var(--focus-ring),inset_0_-2px_0_0_var(--focus-ring)]",
  middle:
    "group-focus-visible:shadow-[inset_0_2px_0_0_var(--focus-ring),inset_0_-2px_0_0_var(--focus-ring)]",
  last: "group-focus-visible:shadow-[inset_-2px_0_0_0_var(--focus-ring),inset_0_2px_0_0_var(--focus-ring),inset_0_-2px_0_0_var(--focus-ring)]",
};

const RUN_CELL = "border-b border-(--border-default) group-last:border-b-0";

const WHEN_CELL = `${RUN_CELL} ${RING_ENDS.first} sticky start-0 z-10 border-e bg-card group-hover:bg-(--surface-row-hover) max-md:whitespace-nowrap md:min-w-28`;

const RUN_COLUMN_CELL = `${RUN_CELL} ${RING_ENDS.middle} md:min-w-72`;

const RUN_MIDDLE_CELL = `${RUN_CELL} ${RING_ENDS.middle}`;

const RUN_LAST_CELL = `${RUN_CELL} ${RING_ENDS.last} min-w-28`;

const RUN_ROW = "group focus-visible:outline-none";

const FOCUSABLE_ROW =
  "group focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring";

const COST_TONE: Readonly<Record<CostDisplay["kind"], "warning" | "neutral">> = {
  priced: "neutral",
  estimated: "warning",
  "lower-bound": "warning",
  "no-rate": "neutral",
  unknown: "neutral",
  "not-billed": "neutral",
};

function LtrMono({
  children,
  breaks,
}: {
  readonly children: string;
  readonly breaks: "small-screens" | "anywhere";
}): ReactNode {
  return (
    <span dir="ltr">
      <span
        className={
          breaks === "anywhere"
            ? "font-mono wrap-anywhere"
            : "font-mono max-md:break-all md:wrap-anywhere"
        }
      >
        {children}
      </span>
    </span>
  );
}

function useFocusRevealedRow(
  regionRef: RefObject<HTMLDivElement | null>,
  visibleCount: number,
): (firstRevealed: number) => void {
  const pending = useRef<number | null>(null);
  useEffect(() => {
    const index = pending.current;
    if (index === null || visibleCount <= index) {
      return;
    }
    pending.current = null;
    regionRef.current?.querySelectorAll<HTMLElement>("tbody tr")[index]?.focus();
  }, [visibleCount, regionRef]);
  return (firstRevealed) => {
    pending.current = firstRevealed;
  };
}

function noticeText(notice: RunHistoryNotice): string {
  switch (notice.kind) {
    case "unavailable":
      return notice.reason === "too-large"
        ? "The run history file is over 8 MiB, so it was not read. The next recorded run replaces the file, and the runs in it are lost."
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
  const reason = [cost.hint, ...cost.caveats].filter((part) => part !== undefined).join(" ");
  return (
    <div className="flex min-w-20 flex-col items-start gap-1">
      {cost.kind === "priced" ? (
        <span className="whitespace-nowrap font-medium tabular-nums">{cost.label}</span>
      ) : (
        <Badge tone={COST_TONE[cost.kind]} verbatim wrap>
          {cost.label}
        </Badge>
      )}
      <span className="sr-only">{`. ${reason}`}</span>
    </div>
  );
}

type UnpricedKind = Exclude<RunHistoryRecord["cost"]["pricing"], "priced">;

const UNPRICED_ORDER: readonly UnpricedKind[] = [
  "no-rate-on-file",
  "rate-unit-mismatch",
  "no-usage",
  "not-billed",
];

const UNPRICED_NOTE: Readonly<Record<Exclude<UnpricedKind, "not-billed">, string>> = {
  "no-rate-on-file":
    "No rate: your config had no rate on file for that provider and model when the run ended. A rate added under rates prices future runs, not these.",
  "rate-unit-mismatch":
    "No rate: the rate on file for that model was in a different unit than the run was measured in, tokens or characters, when the run ended. A corrected unit under rates prices future runs, not these.",
  "no-usage":
    "Unknown: keys were sent, but the provider reported no tokens, so no cost can be worked out.",
};

function unpricedNote(pricing: UnpricedKind, records: readonly RunHistoryRecord[]): string {
  if (pricing !== "not-billed") {
    return UNPRICED_NOTE[pricing];
  }
  const rateKeys: string[] = [];
  for (const { cost } of records) {
    if (cost.pricing === "not-billed") {
      rateKeys.push(cost.rateKey);
    }
  }
  return notBilledNote(rateKeys);
}

export function CostNotes({
  records,
}: {
  readonly records: readonly RunHistoryRecord[];
}): ReactNode {
  const costs = records.map((record) => describeCost(record.cost));
  const rates = new Map<string, { readonly rateKey: string; readonly asOf: string }>();
  for (const { cost } of records) {
    if (cost.pricing === "priced") {
      rates.set(`${cost.rateKey} ${cost.asOf}`, { rateKey: cost.rateKey, asOf: cost.asOf });
    }
  }
  const estimated = costs.some((cost) => cost.kind === "estimated");
  const lowerBound = records.some((record) => describeTokens(record).lowerBound);
  const present = new Set(records.map((record) => record.cost.pricing));
  const unpriced = UNPRICED_ORDER.filter((pricing) => present.has(pricing));
  if (rates.size === 0 && !estimated && !lowerBound && unpriced.length === 0) {
    return null;
  }
  return (
    <ul
      className="m-0 mb-3 flex list-none flex-col gap-1 p-0 text-xs text-muted-foreground"
      data-run-history-cost-notes=""
    >
      {rates.size === 0 ? null : (
        <li>
          Priced at the rate on file when each run ended:{" "}
          {[...rates.entries()].map(([key, rate], index) => (
            <span key={key}>
              {index === 0 ? "" : ", "}
              <LtrMono breaks="anywhere">{rate.rateKey}</LtrMono> as of {rate.asOf}
            </span>
          ))}
          .
        </li>
      )}
      {unpriced.map((pricing) => (
        <li key={pricing}>{unpricedNote(pricing, records)}</li>
      ))}
      {estimated ? (
        <li>
          Estimated: worked out from the source characters sent, not from reported tokens. Repeated
          source strings are counted every time, and retried requests and keys the provider failed
          on are not counted.
        </li>
      ) : null}
      {lowerBound ? (
        <li>
          At least: a locale sent keys and reported no tokens, so the token count and any amount
          cover only what was reported.
        </li>
      ) : null}
    </ul>
  );
}

function TokensCell({ record }: { readonly record: RunHistoryRecord }): ReactNode {
  const tokens = describeTokens(record);
  if (!tokens.reported) {
    return <span className="text-muted-foreground">not reported</span>;
  }
  return (
    <span>
      {tokens.lowerBound ? "at least " : ""}
      <span className="whitespace-nowrap">{formatCount(tokens.input ?? 0)} in /</span>{" "}
      <span className="whitespace-nowrap">{formatCount(tokens.output ?? 0)} out</span>
    </span>
  );
}

function plural(count: number, one: string, many: string): string {
  return `${formatCount(count)} ${count === 1 ? one : many}`;
}

interface ResultView {
  readonly badge: { readonly tone: "danger" | "warning"; readonly text: string } | undefined;
  readonly summary: string;
}

function resultView(record: RunHistoryRecord): ResultView {
  const totals = totalLocales(record);
  const failed = totals.failedLocales > 0;
  const partialText = plural(totals.partialLocales, "locale partial", "locales partial");
  let badge: ResultView["badge"];
  if (failed) {
    badge = {
      tone: "danger",
      text: plural(totals.failedLocales, "locale failed", "locales failed"),
    };
  } else if (totals.partialLocales > 0) {
    badge = { tone: "warning", text: partialText };
  }
  const omitted = record.localesOmitted ?? 0;
  const counters: readonly (readonly [number, string])[] = [
    [failed ? totals.partialLocales : 0, partialText],
    [
      totals.cacheHits + totals.fuzzyHits,
      `${formatCount(totals.cacheHits + totals.fuzzyHits)} from memory`,
    ],
    [totals.generated, `${formatCount(totals.generated)} generated`],
    [totals.pruned, `${formatCount(totals.pruned)} pruned`],
    [totals.integrityMismatches, `${formatCount(totals.integrityMismatches)} refused`],
    [totals.providerFailures, plural(totals.providerFailures, "key failed", "keys failed")],
    [omitted, plural(omitted, "locale not listed", "locales not listed")],
  ];
  return {
    badge,
    summary: [
      `${formatCount(totals.translated)} translated`,
      ...counters.filter(([count]) => count > 0).map(([, text]) => text),
    ].join(", "),
  };
}

function ResultCell({ record }: { readonly record: RunHistoryRecord }): ReactNode {
  const { badge, summary } = resultView(record);
  return (
    <div className="flex flex-col items-start gap-1">
      {badge === undefined ? null : (
        <Badge tone={badge.tone} verbatim wrap>
          {badge.text}
        </Badge>
      )}
      <span className="text-xs text-muted-foreground">{summary}</span>
    </div>
  );
}

function rowKeys(records: readonly RunHistoryRecord[]): readonly string[] {
  const seen = new Map<string, number>();
  return records.map((record) => {
    const occurrence = seen.get(record.at) ?? 0;
    seen.set(record.at, occurrence + 1);
    return `${record.at}#${occurrence}`;
  });
}

function RunsTable({ records }: { readonly records: readonly RunHistoryRecord[] }): ReactNode {
  const [shown, setShown] = useState(INITIAL_RUN_ROWS);
  const regionRef = useRef<HTMLDivElement>(null);
  const overflows = useHorizontalOverflow(regionRef);
  const markReveal = useFocusRevealedRow(regionRef, shown);
  const rows = records.slice(0, shown);
  const keys = rowKeys(rows);

  return (
    <div className="mt-6">
      <CostNotes records={records} />
      <ScrollHint targetRef={regionRef} className="mb-2" />
      <TableCard aria-label="Recorded runs" ref={regionRef} tabIndex={overflows ? 0 : undefined}>
        <Table className="border-separate border-spacing-0">
          <caption className="sr-only">Recorded runs, newest first</caption>
          <TableHead>
            <tr>
              <TableHeaderCell className={WHEN_HEAD}>When</TableHeaderCell>
              <TableHeaderCell>Run</TableHeaderCell>
              <TableHeaderCell>Tokens</TableHeaderCell>
              <TableHeaderCell>Cost</TableHeaderCell>
              <TableHeaderCell>Result</TableHeaderCell>
            </tr>
          </TableHead>
          <TableBody>
            {rows.map((record, index) => (
              <TableRow key={keys[index]} className={RUN_ROW} tabIndex={-1}>
                <TableCell className={WHEN_CELL}>
                  <time dateTime={record.at}>
                    <span className="md:hidden">{formatShortTimestamp(record.at)}</span>
                    <span className="max-md:hidden">{formatTimestamp(record.at)}</span>
                  </time>
                </TableCell>
                <TableCell className={RUN_COLUMN_CELL}>
                  <div className="font-medium">{describeTrigger(record)}</div>
                  <div className="text-xs text-muted-foreground">
                    <LtrMono breaks="small-screens">{describeProvider(record)}</LtrMono>
                  </div>
                </TableCell>
                <TableCell className={RUN_MIDDLE_CELL}>
                  <TokensCell record={record} />
                </TableCell>
                <TableCell className={RUN_MIDDLE_CELL}>
                  <CostCell cost={describeCost(record.cost)} />
                </TableCell>
                <TableCell className={RUN_LAST_CELL}>
                  <ResultCell record={record} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableCard>
      {records.length > shown ? (
        <div className="mt-3">
          <Button
            onClick={() => {
              markReveal(shown);
              setShown(shown + PAGE_ROWS);
            }}
          >
            Show more runs
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function MeasuredCell({ row }: { readonly row: CoverageRow }): ReactNode {
  if (row.known !== undefined && row.measuredInLatestRun) {
    return <time dateTime={row.known.measuredAt}>{formatTimestamp(row.known.measuredAt)}</time>;
  }
  return (
    <div className="flex flex-col items-start gap-1">
      <Badge tone={row.coverageCheckFailed ? "warning" : "neutral"} verbatim>
        {row.coverageCheckFailed ? "Coverage check failed in this run" : "Not measured in this run"}
      </Badge>
      {row.known === undefined ? null : (
        <span className="text-xs text-muted-foreground">
          Last known{" "}
          <time dateTime={row.known.measuredAt}>{formatTimestamp(row.known.measuredAt)}</time>
        </span>
      )}
    </div>
  );
}

function CoverageRowView({ row }: { readonly row: CoverageRow }): ReactNode {
  const figure = (pick: "missing" | "stale" | "upToDate"): string =>
    row.known === undefined ? "-" : formatCount(row.known[pick]);
  return (
    <TableRow className={FOCUSABLE_ROW} tabIndex={-1}>
      <TableCell dir="ltr">
        <MonoValue breakAnywhere>{row.locale}</MonoValue>
      </TableCell>
      <TableCell numeric>{figure("missing")}</TableCell>
      <TableCell numeric>{figure("stale")}</TableCell>
      <TableCell numeric>{figure("upToDate")}</TableCell>
      <TableCell>
        <MeasuredCell row={row} />
      </TableCell>
    </TableRow>
  );
}

function CoverageTable({
  rows,
  runCount,
}: {
  readonly rows: readonly CoverageRow[];
  readonly runCount: number;
}): ReactNode {
  const regionRef = useRef<HTMLDivElement>(null);
  const overflows = useHorizontalOverflow(regionRef);
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? rows : rows.slice(0, INITIAL_COVERAGE_ROWS);
  const markReveal = useFocusRevealedRow(regionRef, visible.length);
  if (rows.length === 0) {
    return (
      <p className="m-0 mt-6 text-sm text-muted-foreground">
        No coverage was measured in these runs.
      </p>
    );
  }
  return (
    <div className="mt-6">
      <h3 className="m-0 text-sm font-medium text-foreground">Coverage after the run</h3>
      <p className="m-0 mb-2 text-xs text-muted-foreground">
        Read from the newest {formatCount(runCount)} recorded {runCount === 1 ? "run" : "runs"}{" "}
        listed above. A locale that no listed run names is left out.
      </p>
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
            {visible.map((row) => (
              <CoverageRowView key={row.locale} row={row} />
            ))}
          </TableBody>
        </Table>
      </TableCard>
      {rows.length > visible.length ? (
        <div className="mt-3">
          <Button
            onClick={() => {
              markReveal(visible.length);
              setShowAll(true);
            }}
          >
            Show all {formatCount(rows.length)} locales
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function Trends({ records }: { readonly records: readonly RunHistoryRecord[] }): ReactNode {
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
  const tokenNotes = [
    tokens.some((point) => point.value === undefined)
      ? "A run with no bar did not report tokens."
      : undefined,
    tokens.some((point) => point.hollow) ? "A hollow bar is a lower bound." : undefined,
  ].filter((note) => note !== undefined);
  const oldest = chronological[0];
  const newest = chronological.at(-1);
  const span =
    oldest === undefined || newest === undefined
      ? undefined
      : {
          first: <time dateTime={oldest.at}>{formatTimestamp(oldest.at)}</time>,
          last: <time dateTime={newest.at}>{formatTimestamp(newest.at)}</time>,
        };

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
        span={span}
      />
      <RunHistoryChart
        title="Tokens per run"
        kind="bars"
        points={tokens}
        labels={chronological.map((record) => {
          const described = describeTokens(record);
          const figure = described.reported ? formatCount(described.total ?? 0) : "not reported";
          return `${formatTimestamp(record.at)}: ${described.lowerBound ? "at least " : ""}${figure}`;
        })}
        peak={formatCount(tokenPeak)}
        note={tokenNotes.length === 0 ? undefined : tokenNotes.join(" ")}
        span={span}
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
          runs and runs that leave no trace are not recorded.
        </EmptyState>
      ) : null}
      {display.records.length > 0 ? (
        <>
          <Trends records={display.records} />
          <RunsTable records={display.records} />
          <CoverageTable
            rows={lastKnownCoverage(display.records)}
            runCount={display.records.length}
          />
        </>
      ) : null}
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
