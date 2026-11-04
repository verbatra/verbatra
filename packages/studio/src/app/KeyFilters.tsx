import { FilterBar, FilterChip, SearchInput, Select } from "@verbatra/ui";
import type { ReactNode, Ref } from "react";
import { KEY_STATUS_LABELS, KEY_STATUSES, type KeyStatus } from "../client/key-status-filter.js";

export interface KeyFiltersProps {
  readonly locales: readonly string[];
  readonly locale: string;
  readonly statuses: ReadonlySet<KeyStatus>;
  readonly counts: Readonly<Record<KeyStatus, number>>;
  readonly unavailable: ReadonlyMap<KeyStatus, string>;
  readonly query: string;
  readonly onLocaleChange: (locale: string) => void;
  readonly onToggleStatus: (status: KeyStatus) => void;
  readonly onQueryChange: (query: string) => void;
  readonly searchRef?: Ref<HTMLInputElement>;
}

export function KeyFilters({
  locales,
  locale,
  statuses,
  counts,
  unavailable,
  query,
  onLocaleChange,
  onToggleStatus,
  onQueryChange,
  searchRef,
}: KeyFiltersProps): ReactNode {
  return (
    <FilterBar label="Key filters" className="mb-4">
      <SearchInput
        ref={searchRef}
        aria-label="Filter by key or translation text"
        placeholder="Filter by key or text…"
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
      />
      <Select
        aria-label="Filter by locale"
        value={locale}
        onChange={(event) => onLocaleChange(event.target.value)}
      >
        <option value="">All locales</option>
        {locales.map((code) => (
          <option key={code} value={code}>
            {code}
          </option>
        ))}
      </Select>
      <fieldset className="relative m-0 flex flex-wrap items-center gap-1.5 border-0 p-0">
        <legend className="sr-only">Show only keys that are</legend>
        {KEY_STATUSES.map((status) => {
          const reason = unavailable.get(status);
          return (
            <FilterChip
              key={status}
              pressed={statuses.has(status)}
              count={counts[status]}
              {...(reason === undefined ? {} : { unavailable: reason })}
              data-status-filter={status}
              onClick={() => onToggleStatus(status)}
            >
              {KEY_STATUS_LABELS[status]}
            </FilterChip>
          );
        })}
      </fieldset>
    </FilterBar>
  );
}
