import { Button, Card, EmptyState, Icon, PageSection, TableSkeleton } from "@verbatra/ui";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { DiffLocale } from "../../client/diff-view.js";
import { isFullyInSync } from "../../client/diff-view.js";
import { MAX_RENDERED_KEYS } from "../../client/filter.js";
import {
  emptyKeyCounts,
  KEY_STATUSES,
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
import { ErrorMessage } from "../ErrorMessage.js";
import { KeyDetailDrawer } from "../KeyDetailDrawer.js";
import { KeyFilters } from "../KeyFilters.js";
import { KeysTable } from "../KeysTable.js";
import { PageHeader } from "../PageHeader.js";
import type { PanelProps } from "../panel-props.js";
import { type DiffState, useDiffState } from "../use-diff-state.js";
import { useLocaleIntegrity } from "../use-locale-integrity.js";
import { useLocaleValues } from "../use-locale-values.js";
import { useReviewQueue } from "../use-review-queue.js";
import {
  knownLocalesOf,
  type TranslationsRoute,
  useTranslationsRoute,
} from "../use-translations-route.js";

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
): {
  readonly sources: KeyStatusSources;
  readonly unavailable: ReadonlyMap<KeyStatus, string>;
  readonly trouble: SourceTrouble;
} {
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
    trouble: sourceTrouble([review.kind, integrity.kind]),
  };
}

const LOADING_REASON = "Still loading";

function unavailableReason(view: { readonly kind: string }): string {
  return view.kind === "loading" ? LOADING_REASON : "Not available right now";
}

type SourceTrouble = "loading" | "failed" | null;

function sourceTrouble(kinds: readonly RefreshableView<unknown>["kind"][]): SourceTrouble {
  if (kinds.includes("error")) {
    return "failed";
  }
  return kinds.includes("loading") ? "loading" : null;
}

const NO_LOCALES: readonly DiffLocale[] = [];

function localeOptionsFor(
  locales: readonly DiffLocale[] | null,
  chosen: string,
): readonly string[] {
  if (locales !== null) {
    return locales.map((entry) => entry.locale);
  }
  return chosen === "" ? [] : [chosen];
}

function keyCountText(rows: KeyTableRows, narrowed: boolean, incomplete: boolean): string {
  const soFar = incomplete ? " so far" : "";
  if (rows.truncated) {
    return `Showing ${MAX_RENDERED_KEYS} of ${rows.totalMatches} keys${soFar}. Refine the filter to see more.`;
  }
  if (narrowed) {
    return `${rows.totalMatches} matching ${rows.totalMatches === 1 ? "key" : "keys"}${soFar}`;
  }
  return `${rows.totalMatches} ${rows.totalMatches === 1 ? "key needs" : "keys need"} attention${soFar}`;
}

function KeysFrame({
  summary,
  children,
}: {
  readonly summary: string;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <PageSection
      title="Keys"
      meta={
        <p aria-live="polite" className="text-xs text-muted-foreground" data-key-count="">
          {summary}
        </p>
      }
    >
      {children}
    </PageSection>
  );
}

const STILL_LOADING = new Map(KEY_STATUSES.map((status) => [status, LOADING_REASON]));

function KeysSection({
  locales,
  route,
  refreshToken,
  localeValuesView,
  review,
  integrity,
}: {
  readonly locales: readonly DiffLocale[] | null;
  readonly route: TranslationsRoute;
  readonly refreshToken: number;
  readonly localeValuesView: RefreshableView<LocaleValuesData>;
  readonly review: RefreshableView<ReviewQueueData>;
  readonly integrity: RefreshableView<LocaleIntegrityData>;
}): ReactNode {
  const searchRef = useRef<HTMLInputElement | null>(null);
  const { locale, statuses, query, selectedKey } = route;
  const localeValues = localeValuesOrEmpty(localeValuesView);
  const { sources, unavailable, trouble } = useMemo(
    () => statusSources(review, integrity),
    [review, integrity],
  );
  const loaded = locales ?? NO_LOCALES;
  const index = useMemo(() => keyStatusIndex(loaded, sources), [loaded, sources]);
  const rows = useMemo(
    () => keyTableRows({ locales: loaded, index, localeValues, locale, statuses, query }),
    [loaded, index, localeValues, locale, statuses, query],
  );
  const narrowed = statuses.size > 0 || query.trim() !== "";
  const loading = locales === null;
  const incomplete = trouble !== null;

  return (
    <KeysFrame summary={loading ? "" : keyCountText(rows, narrowed, incomplete)}>
      <KeyFilters
        locales={localeOptionsFor(locales, locale)}
        locale={locale}
        statuses={statuses}
        counts={loading ? emptyKeyCounts() : rows.counts}
        unavailable={loading ? STILL_LOADING : unavailable}
        query={query}
        onLocaleChange={(next) => route.setFilter({ locale: next, statuses })}
        onToggleStatus={(status) =>
          route.setFilter({ locale, statuses: toggleStatus(statuses, status) })
        }
        onQueryChange={route.setQuery}
        searchRef={searchRef}
      />
      {localeValuesView.kind === "error" ? (
        <ErrorMessage
          error={localeValuesView.error}
          prefix="Source and translation text could not be read, so search only matches key names."
        />
      ) : null}
      {loading ? (
        <div role="status" aria-busy="true">
          <span className="sr-only">Loading...</span>
          <TableSkeleton />
        </div>
      ) : rows.items.length === 0 ? (
        <NoKeys
          narrowed={narrowed}
          trouble={trouble}
          searching={query.trim() !== ""}
          onClear={() => {
            route.setFilter({ locale: "", statuses: new Set(), query: "" });
            searchRef.current?.focus();
          }}
        />
      ) : (
        <>
          <KeysTable
            locales={loaded}
            keys={rows.items}
            locale={locale}
            index={index}
            localeValues={localeValues}
            selectedKey={selectedKey}
            refreshToken={refreshToken}
            onSelectKey={route.setSelectedKey}
          />
          {rows.truncated ? (
            <p className="mt-2 text-xs text-muted-foreground" data-key-cap="">
              {keyCountText(rows, narrowed, incomplete)}
            </p>
          ) : null}
        </>
      )}
    </KeysFrame>
  );
}

function NoKeys({
  narrowed,
  trouble,
  searching,
  onClear,
}: {
  readonly narrowed: boolean;
  readonly trouble: SourceTrouble;
  readonly searching: boolean;
  readonly onClear: () => void;
}): ReactNode {
  if (!narrowed && trouble === "failed") {
    return (
      <EmptyState icon="alert" title="No keys found so far">
        The review queue or the integrity check could not be read, so keys that need attention there
        may be missing. Search for a key or text to browse every key.
      </EmptyState>
    );
  }
  if (!narrowed && trouble === "loading") {
    return (
      <EmptyState icon="search" title="Still checking">
        The review queue and the integrity check are still loading, so keys that need attention
        there may appear in a moment. Search for a key or text to browse every key.
      </EmptyState>
    );
  }
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

  const route = useTranslationsRoute(knownLocalesOf(diff), localeValuesView);
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
      {diff.kind === "loading" || diff.kind === "loaded" ? (
        <KeysSection
          locales={diff.kind === "loaded" ? diff.locales : null}
          route={route}
          refreshToken={refreshToken}
          localeValuesView={localeValuesView}
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
