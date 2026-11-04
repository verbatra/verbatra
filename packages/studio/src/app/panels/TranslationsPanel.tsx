import { Button, Card, EmptyState, Icon, TableSkeleton } from "@verbatra/ui";
import type { ReactNode } from "react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { DiffLocale } from "../../client/diff-view.js";
import { isFullyInSync } from "../../client/diff-view.js";
import { MAX_RENDERED_KEYS } from "../../client/filter.js";
import {
  type KeyStatus,
  type KeyStatusSources,
  type KeyTableRows,
  keyStatusIndex,
  keyTableRows,
  type LocaleIntegrityData,
  toggleStatus,
} from "../../client/key-status-filter.js";
import type { LocaleValuesData } from "../../client/locale-values.js";
import { localeValuesOrEmpty } from "../../client/locale-values.js";
import { type ReviewQueueData, unreviewedRows } from "../../client/review-queue-data.js";
import { buildReviewReportMarkdown } from "../../client/review-report.js";
import type { RefreshableView } from "../../client/state.js";
import { DiffErrorNotice } from "../DiffErrorNotice.js";
import { EditEntryDialog } from "../EditEntryDialog.js";
import { KeyDetailDrawer } from "../KeyDetailDrawer.js";
import { KeyFilters } from "../KeyFilters.js";
import { KeysTable } from "../KeysTable.js";
import { PageHeader } from "../PageHeader.js";
import type { PanelProps } from "../panel-props.js";
import { type DiffState, useDiffState } from "../use-diff-state.js";
import { useLocaleIntegrity } from "../use-locale-integrity.js";
import { useLocaleValues } from "../use-locale-values.js";
import { useReviewQueue } from "../use-review-queue.js";
import { type TranslationsRoute, useTranslationsRoute } from "../use-translations-route.js";

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
    <Button onClick={() => void handleClick()}>
      <Icon name={copied ? "check" : "copy"} size={14} />
      {copied ? "Copied" : "Copy as review report"}
    </Button>
  );
}

function AllClearCard({ brokenInSync }: { readonly brokenInSync: boolean }): ReactNode {
  return (
    <Card
      role="status"
      padding="sm"
      className="mb-6 flex flex-wrap items-center gap-3 border-s-[3px] border-s-success"
    >
      <Icon name="check" size={16} className="flex-none text-success" />
      <div>
        <p className="m-0 text-sm font-semibold text-foreground">Everything is in sync</p>
        <p className="m-0 mt-0.5 text-sm text-muted-foreground">
          No missing, changed, or orphaned keys in any configured locale.
          {brokenInSync
            ? " Some translations still have integrity problems; they are listed under Keys."
            : ""}
        </p>
      </div>
    </Card>
  );
}

function hasIntegrityProblems(integrity: RefreshableView<LocaleIntegrityData>): boolean {
  return integrity.kind === "data" && integrity.data.some((locale) => locale.entries.length > 0);
}

function statusSources(
  review: RefreshableView<ReviewQueueData>,
  integrity: RefreshableView<LocaleIntegrityData>,
): { readonly sources: KeyStatusSources; readonly unavailable: ReadonlyMap<KeyStatus, string> } {
  const unavailable = new Map<KeyStatus, string>();
  if (review.kind !== "data") {
    unavailable.set("review", unavailableReason(review));
  }
  if (integrity.kind !== "data") {
    unavailable.set("integrity", unavailableReason(integrity));
  }
  return {
    sources: {
      review: review.kind === "data" ? unreviewedRows(review.data) : [],
      integrity: integrity.kind === "data" ? integrity.data : [],
    },
    unavailable,
  };
}

function unavailableReason(view: { readonly kind: string }): string {
  return view.kind === "loading" ? "Still loading" : "Not available right now";
}

function KeyCountSummary({
  rows,
  narrowed,
}: {
  readonly rows: KeyTableRows;
  readonly narrowed: boolean;
}): ReactNode {
  const noun = rows.totalMatches === 1 ? "key" : "keys";
  let text = `${rows.totalMatches} matching ${noun}`;
  if (rows.truncated) {
    text = `Showing ${MAX_RENDERED_KEYS} of ${rows.totalMatches} keys, refine the filter to see more.`;
  } else if (!narrowed) {
    text = `${rows.totalMatches} ${rows.totalMatches === 1 ? "key needs" : "keys need"} attention`;
  }
  return (
    <p aria-live="polite" className="mb-3 text-xs text-muted-foreground" data-key-count="">
      {text}
    </p>
  );
}

function KeysSection({
  locales,
  route,
  onSelectKey,
  refreshToken,
  localeValues,
  review,
  integrity,
}: {
  readonly locales: readonly DiffLocale[];
  readonly route: TranslationsRoute;
  readonly onSelectKey: (key: string) => void;
  readonly refreshToken: number;
  readonly localeValues: LocaleValuesData;
  readonly review: RefreshableView<ReviewQueueData>;
  readonly integrity: RefreshableView<LocaleIntegrityData>;
}): ReactNode {
  const headingId = useId();
  const searchRef = useRef<HTMLInputElement | null>(null);
  const { locale, statuses, query } = route;
  const { sources, unavailable } = useMemo(
    () => statusSources(review, integrity),
    [review, integrity],
  );
  const index = useMemo(() => keyStatusIndex(locales, sources), [locales, sources]);
  const rows = useMemo(
    () => keyTableRows({ locales, index, localeValues, locale, statuses, query }),
    [locales, index, localeValues, locale, statuses, query],
  );
  const narrowed = locale !== "" || statuses.size > 0 || query.trim() !== "";

  return (
    <section aria-labelledby={headingId} className="mb-10">
      <h2 id={headingId} className="mb-3 text-base font-semibold text-foreground">
        Keys
      </h2>
      <KeyFilters
        locales={locales.map((entry) => entry.locale)}
        locale={locale}
        statuses={statuses}
        counts={rows.counts}
        unavailable={unavailable}
        query={query}
        onLocaleChange={(next) => route.setFilter({ locale: next, statuses })}
        onToggleStatus={(status) =>
          route.setFilter({ locale, statuses: toggleStatus(statuses, status) })
        }
        onQueryChange={route.setQuery}
        searchRef={searchRef}
      />
      {rows.items.length === 0 ? (
        <NoKeys
          narrowed={narrowed}
          searching={query.trim() !== ""}
          onClear={() => {
            route.setFilter({ locale: "", statuses: new Set(), query: "" });
            searchRef.current?.focus();
          }}
        />
      ) : (
        <>
          <KeyCountSummary rows={rows} narrowed={narrowed} />
          <KeysTable
            locales={locales}
            keys={rows.items}
            locale={locale}
            index={index}
            localeValues={localeValues}
            refreshToken={refreshToken}
            onSelectKey={onSelectKey}
          />
        </>
      )}
    </section>
  );
}

function NoKeys({
  narrowed,
  searching,
  onClear,
}: {
  readonly narrowed: boolean;
  readonly searching: boolean;
  readonly onClear: () => void;
}): ReactNode {
  if (!narrowed) {
    return (
      <EmptyState icon="check" title="No keys need attention">
        Search for a key or text to browse every key.
      </EmptyState>
    );
  }
  return (
    <EmptyState
      icon="search"
      title="No matching keys"
      action={<Button onClick={onClear}>Clear filters</Button>}
    >
      {searching
        ? "No key, source text, or translation matches the search in the chosen locales and states."
        : "No locale has a key in the chosen states."}
    </EmptyState>
  );
}

function DiffNotices({
  diff,
  brokenInSync,
}: {
  readonly diff: DiffState;
  readonly brokenInSync: boolean;
}): ReactNode {
  if (diff.kind === "loading") {
    return (
      <div role="status" aria-busy="true">
        <span className="sr-only">Loading...</span>
        <TableSkeleton />
      </div>
    );
  }
  return (
    <>
      {diff.kind === "loaded" && isFullyInSync(diff.locales) ? (
        <AllClearCard brokenInSync={brokenInSync} />
      ) : null}
      <DiffErrorNotice diff={diff} />
    </>
  );
}

export function TranslationsPanel({ refreshToken }: PanelProps): ReactNode {
  const diff = useDiffState(refreshToken);
  const [editingLocale, setEditingLocale] = useState<string | null>(null);
  const [lastEditedLocale, setLastEditedLocale] = useState<string | null>(null);
  const localeValuesView = useLocaleValues(refreshToken);
  const localeValues = localeValuesOrEmpty(localeValuesView);

  const route = useTranslationsRoute(
    diff.kind === "loaded" ? diff.locales.map((entry) => entry.locale) : [],
    localeValuesView,
  );
  const { selectedKey, setSelectedKey } = route;
  const review = useReviewQueue(refreshToken);

  const allClear = diff.kind === "loaded" && isFullyInSync(diff.locales);
  const integrity = useLocaleIntegrity(refreshToken, diff.kind === "loaded");
  const brokenInSync = allClear && hasIntegrityProblems(integrity);

  return (
    <>
      <PageHeader
        title="Translations"
        description="Every pending change across your target locales, and the keys behind it."
        actions={diff.kind === "loaded" ? <ReviewReportButton locales={diff.locales} /> : undefined}
      />
      <DiffNotices diff={diff} brokenInSync={brokenInSync} />
      {diff.kind === "loaded" ? (
        <KeysSection
          locales={diff.locales}
          route={route}
          onSelectKey={setSelectedKey}
          refreshToken={refreshToken}
          localeValues={localeValues}
          review={review}
          integrity={integrity}
        />
      ) : null}
      {selectedKey !== null && editingLocale === null && diff.kind === "loaded" ? (
        <KeyDetailDrawer
          keyName={selectedKey}
          locales={diff.locales}
          refreshToken={refreshToken}
          focusLocale={lastEditedLocale}
          onClose={() => {
            setSelectedKey(null);
            setEditingLocale(null);
            setLastEditedLocale(null);
          }}
          onEditLocale={(locale) => {
            setEditingLocale(locale);
            setLastEditedLocale(locale);
          }}
        />
      ) : null}
      {selectedKey !== null && editingLocale !== null ? (
        <EditEntryDialog
          locale={editingLocale}
          keyName={selectedKey}
          onClose={() => setEditingLocale(null)}
          onAccepted={() => {
            setEditingLocale(null);
          }}
        />
      ) : null}
    </>
  );
}
