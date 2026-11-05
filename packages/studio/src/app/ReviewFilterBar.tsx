import type { MachineClassOrigin } from "@verbatra/sdk";
import { Button, FilterBar, FilterChip, Kbd, SearchInput, Select } from "@verbatra/ui";
import type { ChangeEvent, ReactNode, Ref } from "react";
import { REVIEW_ORIGIN_LABELS, REVIEW_STATE_LABELS } from "../client/review-filter.js";
import type { QueueReviewState } from "../client/review-queue-data.js";
import { shortcutKeysFor } from "../client/review-shortcuts.js";

export interface ReviewFacets {
  readonly locale: string;
  readonly origin: MachineClassOrigin | "";
  readonly reviewState: QueueReviewState;
}

export const ALL_FACETS: ReviewFacets = { locale: "", origin: "", reviewState: "unreviewed" };

export function isReviewDone(facets: ReviewFacets, query: string): boolean {
  return facets.origin === "" && facets.reviewState === "unreviewed" && query.trim() === "";
}

export function isDefaultFacets(facets: ReviewFacets, query: string): boolean {
  return (
    facets.locale === ALL_FACETS.locale &&
    facets.origin === ALL_FACETS.origin &&
    facets.reviewState === ALL_FACETS.reviewState &&
    query.trim() === ""
  );
}

const ORIGIN_OPTIONS = Object.keys(REVIEW_ORIGIN_LABELS) as readonly MachineClassOrigin[];

const STATE_OPTIONS = Object.keys(REVIEW_STATE_LABELS) as readonly QueueReviewState[];

function isOrigin(value: string): value is MachineClassOrigin {
  return (ORIGIN_OPTIONS as readonly string[]).includes(value);
}

function StateChips({
  facets,
  counts,
  onFacetsChange,
}: {
  readonly facets: ReviewFacets;
  readonly counts: Readonly<Record<QueueReviewState, number>>;
  readonly onFacetsChange: (facets: ReviewFacets) => void;
}): ReactNode {
  return (
    <fieldset className="relative m-0 flex flex-wrap items-center gap-1.5 border-0 p-0">
      <legend className="sr-only">Show entries that are</legend>
      {STATE_OPTIONS.map((state) => (
        <FilterChip
          key={state}
          pressed={facets.reviewState === state}
          count={counts[state]}
          data-state-filter={state}
          onClick={() => onFacetsChange({ ...facets, reviewState: state })}
        >
          {REVIEW_STATE_LABELS[state]}
        </FilterChip>
      ))}
    </fieldset>
  );
}

function FacetSelects({
  locales,
  facets,
  onFacetsChange,
}: {
  readonly locales: readonly string[];
  readonly facets: ReviewFacets;
  readonly onFacetsChange: (facets: ReviewFacets) => void;
}): ReactNode {
  return (
    <>
      <Select
        aria-label="Filter by locale"
        value={facets.locale}
        onChange={(event) => onFacetsChange({ ...facets, locale: event.target.value })}
      >
        <option value="">All locales</option>
        {locales.map((code) => (
          <option key={code} value={code}>
            {code}
          </option>
        ))}
      </Select>
      <Select
        aria-label="Filter by origin"
        value={facets.origin}
        onChange={(event) =>
          onFacetsChange({
            ...facets,
            origin: isOrigin(event.target.value) ? event.target.value : "",
          })
        }
      >
        <option value="">All origins</option>
        {ORIGIN_OPTIONS.map((origin) => (
          <option key={origin} value={origin}>
            {REVIEW_ORIGIN_LABELS[origin]}
          </option>
        ))}
      </Select>
    </>
  );
}

export interface ApproveAllAction {
  readonly locale: string;
  readonly count: number;
  readonly onClick: () => void;
}

export function ReviewFilterBar({
  locales,
  facets,
  query,
  onFacetsChange,
  onQueryChange,
  onShowShortcuts,
  matchCount,
  stateCounts,
  searchRef,
  approveAll,
}: {
  readonly locales: readonly string[];
  readonly facets: ReviewFacets;
  readonly query: string;
  readonly onFacetsChange: (facets: ReviewFacets) => void;
  readonly onQueryChange: (event: ChangeEvent<HTMLInputElement>) => void;
  readonly onShowShortcuts: () => void;
  readonly matchCount: number;
  readonly stateCounts: Readonly<Record<QueueReviewState, number>>;
  readonly searchRef: Ref<HTMLInputElement>;
  readonly approveAll: ApproveAllAction | undefined;
}): ReactNode {
  return (
    <FilterBar label="Review queue filters" data-shortcuts-paused="">
      <StateChips facets={facets} counts={stateCounts} onFacetsChange={onFacetsChange} />
      <FacetSelects locales={locales} facets={facets} onFacetsChange={onFacetsChange} />
      <SearchInput
        ref={searchRef}
        aria-label="Filter by key or translation text"
        placeholder="Filter by key or text…"
        value={query}
        onChange={onQueryChange}
      />
      <span className="text-sm text-muted-foreground">
        {matchCount} {matchCount === 1 ? "entry" : "entries"}
      </span>
      {approveAll !== undefined ? (
        <Button variant="secondary-success" onClick={approveAll.onClick} data-approve-locale="">
          Approve all in {approveAll.locale} ({approveAll.count})…
        </Button>
      ) : null}
      <Button
        variant="ghost"
        className="ms-auto"
        onClick={onShowShortcuts}
        aria-keyshortcuts={shortcutKeysFor("help")}
      >
        Keyboard shortcuts
        <Kbd>?</Kbd>
      </Button>
    </FilterBar>
  );
}
