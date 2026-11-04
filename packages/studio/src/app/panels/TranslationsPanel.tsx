import {
  Accordion,
  AccordionItem,
  Badge,
  Button,
  Card,
  EmptyState,
  Icon,
  SegmentedControl,
} from "@verbatra/ui";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { DiffLocale } from "../../client/diff-view.js";
import { isFullyInSync } from "../../client/diff-view.js";
import { filterAndCapKeys, type KeyValuePair, MAX_RENDERED_KEYS } from "../../client/filter.js";
import {
  isLocaleListed,
  KEY_STATUS_LABELS,
  type KeyGroups,
  type KeyStatus,
  type KeyStatusFilter,
  type KeyStatusSources,
  keyGroupsFor,
  type LocaleIntegrityData,
  listedStatuses,
  localeStatusSummary,
  queryMatcher,
  type StatusSummaryItem,
  statusCounts,
  toggleStatus,
} from "../../client/key-status-filter.js";
import type { LocaleValuesData } from "../../client/locale-values.js";
import { localeValuesOrEmpty, valuesForLocale } from "../../client/locale-values.js";
import { type ReviewQueueData, unreviewedRows } from "../../client/review-queue-data.js";
import { buildReviewReportMarkdown } from "../../client/review-report.js";
import type { RefreshableView } from "../../client/state.js";
import { DiffBadge, isDiffTone } from "../DiffBadge.js";
import { DiffErrorNotice } from "../DiffErrorNotice.js";
import { EditEntryDialog } from "../EditEntryDialog.js";
import { KeyDetailDrawer } from "../KeyDetailDrawer.js";
import { KeyStatusFilterBar } from "../KeyStatusFilterBar.js";
import { Loading } from "../Loading.js";
import { PageHeader } from "../PageHeader.js";
import { ProvenanceBadge } from "../ProvenanceBadge.js";
import type { PanelProps } from "../panel-props.js";
import { StatusGrid } from "../StatusGrid.js";
import { type DiffState, useDiffState } from "../use-diff-state.js";
import { useLocaleIntegrity } from "../use-locale-integrity.js";
import { useLocaleValues } from "../use-locale-values.js";
import { useReviewQueue } from "../use-review-queue.js";
import {
  type DiffViewMode,
  type KeyFilterSelection,
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

const WITHOUT_PROVENANCE: ReadonlySet<KeyStatus> = new Set(["missing", "orphaned"]);

function KeyStatusBadge({ status }: { readonly status: KeyStatus }): ReactNode {
  if (isDiffTone(status)) {
    return <DiffBadge tone={status} />;
  }
  return (
    <Badge tone={status === "integrity" ? "danger" : "warning"}>{KEY_STATUS_LABELS[status]}</Badge>
  );
}

function KeyList({
  status,
  keys,
  query,
  values,
  onSelectKey,
}: {
  readonly status: KeyStatus;
  readonly keys: readonly string[];
  readonly query: string;
  readonly values: ReadonlyMap<string, KeyValuePair>;
  readonly onSelectKey: (key: string) => void;
}): ReactNode {
  const capped = filterAndCapKeys(keys, query, values);
  return (
    <div className="mb-4 last:mb-0">
      <h4 className="mb-2 flex items-center gap-2">
        <KeyStatusBadge status={status} />
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
              <span className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 break-all">{key}</span>
                {WITHOUT_PROVENANCE.has(status) ? null : (
                  <ProvenanceBadge provenance={values.get(key)?.provenance} />
                )}
              </span>
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

function LocaleSectionCounts({
  items,
}: {
  readonly items: readonly StatusSummaryItem[];
}): ReactNode {
  if (items.length === 0) {
    return null;
  }
  return (
    <span
      className="inline-flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-xs"
      data-locale-summary=""
    >
      {items.map((item) => (
        <span key={item.status} className="inline-flex items-baseline gap-1 whitespace-nowrap">
          <span className="text-muted-foreground">{KEY_STATUS_LABELS[item.status]}</span>{" "}
          <span className="font-mono font-semibold tabular-nums text-foreground">{item.count}</span>
        </span>
      ))}
    </span>
  );
}

function LocaleSection({
  locale,
  groups,
  filter,
  query,
  localeValues,
  onSelectKey,
}: {
  readonly locale: DiffLocale;
  readonly groups: KeyGroups;
  readonly filter: KeyStatusFilter;
  readonly query: string;
  readonly localeValues: LocaleValuesData;
  readonly onSelectKey: (key: string) => void;
}): ReactNode {
  const values = useMemo(
    () => valuesForLocale(localeValues, locale.locale),
    [localeValues, locale.locale],
  );
  const searching = query.trim() !== "";
  return (
    <AccordionItem
      defaultOpen={locale.hasPendingChanges || filter.statuses.size > 0 || searching}
      summary={
        <span className="inline-flex flex-wrap items-center gap-2">
          {locale.locale}
          {locale.hasPendingChanges ? (
            <Badge tone="warning">Pending changes</Badge>
          ) : (
            <Badge tone="success">Up to date</Badge>
          )}
          <LocaleSectionCounts
            items={localeStatusSummary(groups, filter, searching, locale.hasPendingChanges)}
          />
        </span>
      }
    >
      {listedStatuses(groups, filter, searching).map((status) => (
        <KeyList
          key={status}
          status={status}
          keys={groups[status]}
          query={query}
          values={values}
          onSelectKey={onSelectKey}
        />
      ))}
    </AccordionItem>
  );
}

function needsIntegrity(diff: DiffState, viewMode: DiffViewMode): boolean {
  return diff.kind === "loaded" && (viewMode === "flat" || isFullyInSync(diff.locales));
}

function hasIntegrityProblems(integrity: RefreshableView<LocaleIntegrityData>): boolean {
  return integrity.kind === "data" && integrity.data.some((locale) => locale.entries.length > 0);
}

function statusSources(
  review: RefreshableView<ReviewQueueData>,
  integrity: RefreshableView<LocaleIntegrityData>,
): { readonly sources: KeyStatusSources; readonly unavailable: ReadonlySet<KeyStatus> } {
  const unavailable = new Set<KeyStatus>();
  if (review.kind !== "data") {
    unavailable.add("review");
  }
  if (integrity.kind !== "data") {
    unavailable.add("integrity");
  }
  return {
    sources: {
      review: review.kind === "data" ? unreviewedRows(review.data) : [],
      integrity: integrity.kind === "data" ? integrity.data : [],
    },
    unavailable,
  };
}

function KeyListView({
  locales,
  locale,
  statuses,
  onFilterChange,
  query,
  onQueryChange,
  localeValues,
  onSelectKey,
  refreshToken,
  integrity,
}: {
  readonly locales: readonly DiffLocale[];
  readonly locale: string;
  readonly statuses: ReadonlySet<KeyStatus>;
  readonly onFilterChange: (filter: KeyFilterSelection & { readonly query?: string }) => void;
  readonly query: string;
  readonly onQueryChange: (query: string) => void;
  readonly localeValues: LocaleValuesData;
  readonly onSelectKey: (key: string) => void;
  readonly refreshToken: number;
  readonly integrity: RefreshableView<LocaleIntegrityData>;
}): ReactNode {
  const searchRef = useRef<HTMLInputElement | null>(null);
  const { sources, unavailable } = statusSources(useReviewQueue(refreshToken), integrity);
  const matches = useMemo(() => queryMatcher(localeValues, query), [localeValues, query]);
  const filter: KeyStatusFilter = { locale: locale === "" ? null : locale, statuses };
  const searching = query.trim() !== "";
  const listed = locales
    .map((entry) => ({ entry, groups: keyGroupsFor(entry, sources, matches) }))
    .filter(({ entry, groups }) => isLocaleListed(entry.locale, groups, filter, searching));

  return (
    <>
      <KeyStatusFilterBar
        locales={locales.map((entry) => entry.locale)}
        locale={locale}
        statuses={statuses}
        counts={statusCounts(locales, sources, filter.locale, matches)}
        unavailable={unavailable}
        query={query}
        onLocaleChange={(next) => onFilterChange({ locale: next, statuses })}
        onToggleStatus={(status) =>
          onFilterChange({ locale, statuses: toggleStatus(statuses, status) })
        }
        onQueryChange={onQueryChange}
        searchRef={searchRef}
      />
      {listed.length === 0 ? (
        <EmptyState
          icon="search"
          title="No matching keys"
          action={
            <Button
              onClick={() => {
                onFilterChange({ locale: "", statuses: new Set(), query: "" });
                searchRef.current?.focus();
              }}
            >
              Clear filters
            </Button>
          }
        >
          {searching
            ? "No key, source text, or translation matches the search in the chosen locales and states."
            : "No locale has a key in the chosen states."}
        </EmptyState>
      ) : (
        <Accordion>
          {listed.map(({ entry, groups }) => (
            <LocaleSection
              key={entry.locale}
              locale={entry}
              groups={groups}
              filter={filter}
              query={query}
              localeValues={localeValues}
              onSelectKey={onSelectKey}
            />
          ))}
        </Accordion>
      )}
    </>
  );
}

const VIEW_MODE_ITEMS: ReadonlyArray<{ readonly id: DiffViewMode; readonly label: string }> = [
  { id: "grid", label: "Grid" },
  { id: "flat", label: "List" },
];

function KeysSection({
  locales,
  locale,
  statuses,
  onFilterChange,
  query,
  onQueryChange,
  viewMode,
  onSelectKey,
  refreshToken,
  localeValues,
  integrity,
  listOnly,
}: {
  readonly locales: readonly DiffLocale[];
  readonly locale: string;
  readonly statuses: ReadonlySet<KeyStatus>;
  readonly onFilterChange: (filter: KeyFilterSelection & { readonly query?: string }) => void;
  readonly query: string;
  readonly onQueryChange: (query: string) => void;
  readonly viewMode: DiffViewMode;
  readonly onSelectKey: (key: string) => void;
  readonly refreshToken: number;
  readonly localeValues: LocaleValuesData;
  readonly integrity: RefreshableView<LocaleIntegrityData>;
  readonly listOnly: boolean;
}): ReactNode {
  return (
    <section aria-label="Keys" className="mb-10">
      {viewMode === "grid" && !listOnly ? (
        <StatusGrid locales={locales} refreshToken={refreshToken} onSelectKey={onSelectKey} />
      ) : (
        <KeyListView
          locales={locales}
          locale={locale}
          statuses={statuses}
          onFilterChange={onFilterChange}
          query={query}
          onQueryChange={onQueryChange}
          localeValues={localeValues}
          onSelectKey={onSelectKey}
          refreshToken={refreshToken}
          integrity={integrity}
        />
      )}
    </section>
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
    return <Loading />;
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
  const { viewMode, selectedKey, setSelectedKey, query, setQuery } = route;

  const allClear = diff.kind === "loaded" && isFullyInSync(diff.locales);
  const integrity = useLocaleIntegrity(refreshToken, needsIntegrity(diff, viewMode));
  const brokenInSync = allClear && hasIntegrityProblems(integrity);

  return (
    <>
      <PageHeader
        title="Translations"
        description="Every pending change across your target locales, and the keys behind it."
        actions={
          diff.kind === "loaded" ? (
            <>
              {allClear ? null : (
                <SegmentedControl
                  items={VIEW_MODE_ITEMS}
                  active={viewMode}
                  onChange={route.setViewMode}
                  label="Keys view"
                />
              )}
              <ReviewReportButton locales={diff.locales} />
            </>
          ) : undefined
        }
      />
      <DiffNotices diff={diff} brokenInSync={brokenInSync} />
      {diff.kind === "loaded" && (!allClear || brokenInSync) ? (
        <KeysSection
          locales={diff.locales}
          locale={route.locale}
          statuses={route.statuses}
          onFilterChange={route.setFilter}
          query={query}
          onQueryChange={setQuery}
          viewMode={viewMode}
          onSelectKey={setSelectedKey}
          refreshToken={refreshToken}
          localeValues={localeValues}
          integrity={integrity}
          listOnly={allClear}
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
