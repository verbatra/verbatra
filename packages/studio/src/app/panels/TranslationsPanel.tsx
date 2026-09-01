import type { ChangeEvent, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  averageCoverage,
  outOfSyncCount,
  type StatusData,
  type StatusRow,
} from "../../client/coverage.js";
import type { DiffLocale } from "../../client/diff-view.js";
import { driftKeys, isFullyInSync } from "../../client/diff-view.js";
import { filterAndCapKeys, type KeyValuePair, MAX_RENDERED_KEYS } from "../../client/filter.js";
import { isRtlLocale } from "../../client/locale-direction.js";
import type { LocaleValuesData } from "../../client/locale-values.js";
import { localeValuesOrEmpty, valuesForLocale } from "../../client/locale-values.js";
import { buildReviewReportMarkdown } from "../../client/review-report.js";
import type { RpcCallResult } from "../../client/rpc-client.js";
import type { RefreshableView, StructuredError } from "../../client/state.js";
import { toUsageTickerDisplayState } from "../../client/usage-ticker-data.js";
import { Accordion, AccordionItem } from "../Accordion.js";
import { reviewOverlayStore, rpcClient } from "../api.js";
import { Badge } from "../Badge.js";
import { Button } from "../Button.js";
import { Card } from "../Card.js";
import type { DiffTone } from "../DiffBadge.js";
import { DiffBadge } from "../DiffBadge.js";
import { EditEntryDialog } from "../EditEntryDialog.js";
import { ErrorMessage } from "../ErrorMessage.js";
import { Icon } from "../Icon.js";
import { SearchInput } from "../Input.js";
import { KeyDetailDrawer } from "../KeyDetailDrawer.js";
import { Loading } from "../Loading.js";
import { MetricCard } from "../MetricCard.js";
import { PageHeader } from "../PageHeader.js";
import { ProgressBar } from "../ProgressBar.js";
import type { PanelProps } from "../panel-props.js";
import { Skeleton, TableSkeleton } from "../Skeleton.js";
import { StatusGrid } from "../StatusGrid.js";
import {
  Table,
  TableBody,
  TableCard,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "../Table.js";
import { Tabs } from "../Tabs.js";
import { Toolbar } from "../Toolbar.js";
import { PageSection } from "../ui.js";
import { useLocaleValues } from "../use-locale-values.js";
import { useStatusData } from "../use-status-data.js";
import { useUsageTicker } from "../use-usage-ticker.js";

type DiffViewMode = "grid" | "flat";

type DiffState =
  | { readonly kind: "loading" }
  | { readonly kind: "error"; readonly error: StructuredError }
  | {
      readonly kind: "loaded";
      readonly hasPendingChanges: boolean;
      readonly locales: readonly DiffLocale[];
      readonly staleError?: StructuredError;
    };

type LockStateResponse = RpcCallResult<"lock.state">;
type LockLocaleState = Extract<
  Extract<LockStateResponse, { ok: true }>["result"],
  { exists: true }
>["locales"][number];

type LockView =
  | { readonly kind: "loading" }
  | { readonly kind: "error"; readonly error: StructuredError }
  | { readonly kind: "no-lock" }
  | {
      readonly kind: "loaded";
      readonly version: number;
      readonly locales: readonly LockLocaleState[];
    };

function useLockState(refreshToken: number): LockView {
  const [view, setView] = useState<LockView>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    void rpcClient.call("lock.state", {}).then((response) => {
      if (cancelled) {
        return;
      }
      if (!response.ok) {
        setView({ kind: "error", error: response.error });
        return;
      }
      if (!response.result.exists) {
        setView({ kind: "no-lock" });
        return;
      }
      setView({
        kind: "loaded",
        version: response.result.version,
        locales: response.result.locales,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [refreshToken]);

  return view;
}

const COPY_CONFIRMATION_MS = 2000;

function ReviewReportButton({ locales }: { readonly locales: readonly DiffLocale[] }): ReactNode {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<number | undefined>(undefined);

  useEffect(
    () => () => {
      if (timeoutRef.current !== undefined) {
        window.clearTimeout(timeoutRef.current);
      }
    },
    [],
  );

  async function handleClick(): Promise<void> {
    try {
      await navigator.clipboard.writeText(buildReviewReportMarkdown(locales));
      setCopied(true);
      timeoutRef.current = window.setTimeout(() => setCopied(false), COPY_CONFIRMATION_MS);
    } catch {}
  }

  return (
    <Button size="md" onClick={() => void handleClick()}>
      <Icon name={copied ? "check" : "copy"} size={14} />
      {copied ? "Copied" : "Copy as review report"}
    </Button>
  );
}

function attentionTile(
  diff: DiffState,
  rows: readonly StatusRow[] | null,
): {
  readonly value: string;
  readonly hint: string;
  readonly tone: "default" | "success" | "danger";
} {
  if (diff.kind === "loading") {
    return { value: "…", hint: "Checking pending changes.", tone: "default" };
  }
  if (diff.kind === "error") {
    return {
      value: "N/A",
      hint: "The pending-change check failed; details below.",
      tone: "default",
    };
  }
  if (isFullyInSync(diff.locales)) {
    return { value: "0", hint: "Everything is in sync.", tone: "success" };
  }
  const pending = driftKeys(diff.locales).length;
  const across =
    rows !== null
      ? `Across ${outOfSyncCount(rows)} of ${rows.length} target ${rows.length === 1 ? "locale" : "locales"}.`
      : "Across your target locales.";
  return { value: String(pending), hint: across, tone: "danger" };
}

function lastRunTile(view: ReturnType<typeof useUsageTicker>): {
  readonly value: string;
  readonly hint: string;
} {
  if (view.kind !== "data") {
    return { value: "…", hint: "Loading the last recorded run." };
  }
  const state = toUsageTickerDisplayState(view.data);
  if (state.kind !== "available") {
    return { value: "No run yet", hint: "Run verbatra translate or watch to record one." };
  }
  const usage =
    state.usage.kind === "reported"
      ? `${state.usage.inputTokens.toLocaleString()} / ${state.usage.outputTokens.toLocaleString()}`
      : "Not reported";
  const budget =
    state.budget.kind === "tracked"
      ? state.budget.exceeded
        ? "Budget ceiling reached. "
        : "Within budget. "
      : "";
  const hintLead = state.usage.kind === "reported" ? "Tokens in / out. " : "";
  return {
    value: usage,
    hint: `${hintLead}${budget}As of ${new Date(state.generatedAt).toLocaleString()}`,
  };
}

function StatStrip({
  status,
  diff,
  refreshToken,
}: {
  readonly status: RefreshableView<StatusData>;
  readonly diff: DiffState;
  readonly refreshToken: number;
}): ReactNode {
  const usage = useUsageTicker(refreshToken);
  const allClear = diff.kind === "loaded" && isFullyInSync(diff.locales);
  const rows = status.kind === "data" ? status.data.rows : null;
  const attention = attentionTile(diff, rows);
  const lastRun = lastRunTile(usage);
  const inSyncCount = rows === null ? null : rows.filter((row) => row.inSync).length;

  return (
    <div className="mb-10">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Needs attention"
          icon="alert"
          value={attention.value}
          hint={attention.hint}
          tone={attention.tone}
        />
        <MetricCard
          label="Avg coverage"
          icon="gauge"
          value={rows === null ? "…" : `${averageCoverage(rows)}%`}
          {...(rows === null ? {} : { progress: averageCoverage(rows) })}
          hint={
            rows === null
              ? "Loading locale coverage."
              : `Across ${rows.length} target ${rows.length === 1 ? "locale" : "locales"}.`
          }
        />
        <MetricCard
          label="Locales in sync"
          icon="globe"
          value={inSyncCount === null || rows === null ? "…" : `${inSyncCount} / ${rows.length}`}
          hint={
            status.kind === "data"
              ? status.data.inSync
                ? "All target locales are in sync."
                : "At least one locale is out of sync."
              : "Loading sync state."
          }
        />
        <MetricCard label="Last run" icon="zap" value={lastRun.value} hint={lastRun.hint} />
      </div>
      {allClear ? (
        <Card
          role="status"
          padding="sm"
          className="mt-4 flex flex-wrap items-center gap-3 border-s-[3px] border-s-success"
        >
          <Icon name="check" size={16} className="flex-none text-success" />
          <div>
            <p className="m-0 text-sm font-semibold text-foreground">Everything is in sync</p>
            <p className="m-0 mt-0.5 text-sm text-muted-foreground">
              No missing, changed, or orphaned keys in any configured locale.
            </p>
          </div>
        </Card>
      ) : null}
      {diff.kind === "loading" ? (
        <div className="mt-4">
          <Skeleton className="h-5 w-64" />
        </div>
      ) : null}
    </div>
  );
}

function KeyList({
  tone,
  keys,
  query,
  values,
  onSelectKey,
}: {
  readonly tone: DiffTone;
  readonly keys: readonly string[];
  readonly query: string;
  readonly values: ReadonlyMap<string, KeyValuePair>;
  readonly onSelectKey: (key: string) => void;
}): ReactNode {
  const capped = filterAndCapKeys(keys, query, values);
  return (
    <div className="mb-4 last:mb-0">
      <h4 className="mb-2 flex items-center gap-2">
        <DiffBadge tone={tone} />
        <span className="text-sm text-muted-foreground">({capped.totalMatches})</span>
      </h4>
      <ul className="m-0 list-none p-0 font-mono text-sm">
        {capped.items.map((key) => (
          <li key={key}>
            <button
              type="button"
              className="-ms-2 block w-full rounded-md px-2 py-1 text-start hover:bg-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
              onClick={() => onSelectKey(key)}
            >
              {key}
            </button>
          </li>
        ))}
      </ul>
      {capped.truncated ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Showing {MAX_RENDERED_KEYS} of {capped.totalMatches}, refine the filter to see more.
        </p>
      ) : null}
    </div>
  );
}

function LocaleSectionCounts({ locale }: { readonly locale: DiffLocale }): ReactNode {
  if (!locale.hasPendingChanges) {
    return null;
  }
  return (
    <span className="text-xs text-muted-foreground">
      {locale.missing.length} missing &middot; {locale.changed.length} changed &middot;{" "}
      {locale.orphaned.length} orphaned
    </span>
  );
}

function LocaleSection({
  locale,
  query,
  localeValues,
  onSelectKey,
}: {
  readonly locale: DiffLocale;
  readonly query: string;
  readonly localeValues: LocaleValuesData;
  readonly onSelectKey: (key: string) => void;
}): ReactNode {
  const values = useMemo(
    () => valuesForLocale(localeValues, locale.locale),
    [localeValues, locale.locale],
  );
  return (
    <AccordionItem
      defaultOpen={locale.hasPendingChanges}
      dir={isRtlLocale(locale.locale) ? "rtl" : undefined}
      summary={
        <span className="inline-flex flex-wrap items-center gap-2">
          {locale.locale}
          {locale.hasPendingChanges ? (
            <Badge tone="warning">Pending changes</Badge>
          ) : (
            <Badge tone="success">Up to date</Badge>
          )}
          <LocaleSectionCounts locale={locale} />
        </span>
      }
    >
      <KeyList
        tone="missing"
        keys={locale.missing}
        query={query}
        values={values}
        onSelectKey={onSelectKey}
      />
      <KeyList
        tone="changed"
        keys={locale.changed}
        query={query}
        values={values}
        onSelectKey={onSelectKey}
      />
      <KeyList
        tone="orphaned"
        keys={locale.orphaned}
        query={query}
        values={values}
        onSelectKey={onSelectKey}
      />
    </AccordionItem>
  );
}

const VIEW_MODE_ITEMS: ReadonlyArray<{ readonly id: DiffViewMode; readonly label: string }> = [
  { id: "grid", label: "Grid" },
  { id: "flat", label: "List" },
];

function KeysSection({
  locales,
  query,
  onQueryChange,
  viewMode,
  onViewModeChange,
  onSelectKey,
  refreshToken,
  localeValues,
}: {
  readonly locales: readonly DiffLocale[];
  readonly query: string;
  readonly onQueryChange: (event: ChangeEvent<HTMLInputElement>) => void;
  readonly viewMode: DiffViewMode;
  readonly onViewModeChange: (mode: DiffViewMode) => void;
  readonly onSelectKey: (key: string) => void;
  readonly refreshToken: number;
  readonly localeValues: LocaleValuesData;
}): ReactNode {
  return (
    <PageSection title="Keys">
      <Toolbar className="mb-4">
        <Tabs
          items={VIEW_MODE_ITEMS}
          active={viewMode}
          onChange={onViewModeChange}
          label="Keys view"
        />
        {viewMode === "flat" ? (
          <SearchInput
            aria-label="Filter by key or translation text"
            placeholder="Filter by key or text…"
            value={query}
            onChange={onQueryChange}
          />
        ) : null}
      </Toolbar>
      {viewMode === "grid" ? (
        <StatusGrid locales={locales} refreshToken={refreshToken} onSelectKey={onSelectKey} />
      ) : (
        <Accordion>
          {locales.map((locale) => (
            <LocaleSection
              key={locale.locale}
              locale={locale}
              query={query}
              localeValues={localeValues}
              onSelectKey={onSelectKey}
            />
          ))}
        </Accordion>
      )}
    </PageSection>
  );
}

function lockCell(lock: LockView, locale: string): ReactNode {
  if (lock.kind !== "loaded") {
    return null;
  }
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
              {row.upToDate.toLocaleString()} / {total.toLocaleString()} keys
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

function LockDetail({ locales }: { readonly locales: readonly LockLocaleState[] }): ReactNode {
  return (
    <AccordionItem
      className="mt-4"
      summary={
        <span className="inline-flex items-center gap-2">
          <Icon name="lock" size={14} className="text-muted-foreground" />
          Lock file details
        </span>
      }
    >
      <p className="mb-3 text-sm text-muted-foreground">
        The lock file&apos;s own record: keys per recorded locale, and drift measured against the
        current files.
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
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </AccordionItem>
  );
}

function LocalesSection({
  status,
  lock,
}: {
  readonly status: RefreshableView<StatusData>;
  readonly lock: LockView;
}): ReactNode {
  return (
    <PageSection
      title="Locales"
      meta={lock.kind === "loaded" ? <Badge tone="neutral">Lock v{lock.version}</Badge> : undefined}
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

export function TranslationsPanel({ refreshToken }: PanelProps): ReactNode {
  const [diff, setDiff] = useState<DiffState>({ kind: "loading" });
  const [query, setQuery] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [editingLocale, setEditingLocale] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<DiffViewMode>("grid");
  const status = useStatusData(refreshToken);
  const lock = useLockState(refreshToken);
  const localeValues = localeValuesOrEmpty(useLocaleValues(refreshToken));

  useEffect(() => {
    let cancelled = false;
    void rpcClient.call("status.diff", {}).then((response) => {
      if (cancelled) {
        return;
      }
      if (!response.ok) {
        setDiff((previous) =>
          previous.kind === "loaded"
            ? { ...previous, staleError: response.error }
            : { kind: "error", error: response.error },
        );
        return;
      }
      setDiff({
        kind: "loaded",
        hasPendingChanges: response.result.hasPendingChanges,
        locales: response.result.locales,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [refreshToken]);

  const allClear = diff.kind === "loaded" && isFullyInSync(diff.locales);

  return (
    <>
      <PageHeader
        kicker="Workspace"
        title="Translations"
        description="Every pending change across your target locales, and how far along each locale is."
        actions={diff.kind === "loaded" ? <ReviewReportButton locales={diff.locales} /> : undefined}
      />
      <StatStrip status={status} diff={diff} refreshToken={refreshToken} />
      {diff.kind === "loading" ? <Loading /> : null}
      {diff.kind === "error" ? <ErrorMessage error={diff.error} /> : null}
      {diff.kind === "loaded" && diff.staleError !== undefined ? (
        <ErrorMessage error={diff.staleError} prefix="Showing the last known pending changes." />
      ) : null}
      {diff.kind === "loaded" && !allClear ? (
        <KeysSection
          locales={diff.locales}
          query={query}
          onQueryChange={(event) => setQuery(event.target.value)}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          onSelectKey={setSelectedKey}
          refreshToken={refreshToken}
          localeValues={localeValues}
        />
      ) : null}
      <LocalesSection status={status} lock={lock} />
      {selectedKey !== null && editingLocale === null && diff.kind === "loaded" ? (
        <KeyDetailDrawer
          keyName={selectedKey}
          locales={diff.locales}
          refreshToken={refreshToken}
          onClose={() => {
            setSelectedKey(null);
            setEditingLocale(null);
          }}
          onEditLocale={setEditingLocale}
        />
      ) : null}
      {selectedKey !== null && editingLocale !== null ? (
        <EditEntryDialog
          locale={editingLocale}
          keyName={selectedKey}
          onClose={() => setEditingLocale(null)}
          onAccepted={(acceptedLocale, key) => {
            reviewOverlayStore.markActioned({ locale: acceptedLocale, key });
            setEditingLocale(null);
          }}
        />
      ) : null}
    </>
  );
}
