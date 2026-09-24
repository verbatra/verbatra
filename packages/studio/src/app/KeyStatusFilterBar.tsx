import type { ReactNode } from "react";
import { KEY_STATUS_LABELS, KEY_STATUSES, type KeyStatus } from "../client/key-status-filter.js";
import { SearchInput } from "./Input.js";
import { cn } from "./lib/cn.js";
import { Select } from "./Select.js";
import { FilterBar } from "./Toolbar.js";

export interface KeyStatusFilterBarProps {
  readonly locales: readonly string[];
  readonly locale: string;
  readonly statuses: ReadonlySet<KeyStatus>;
  readonly counts: Readonly<Record<KeyStatus, number>>;
  readonly unavailable: ReadonlySet<KeyStatus>;
  readonly query: string;
  readonly onLocaleChange: (locale: string) => void;
  readonly onToggleStatus: (status: KeyStatus) => void;
  readonly onQueryChange: (query: string) => void;
}

const TOGGLE_CLASSNAME =
  "inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:not-disabled:bg-accent hover:not-disabled:text-accent-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring disabled:cursor-default disabled:opacity-60";

const PRESSED_CLASSNAME = "border-primary bg-accent text-accent-foreground";

export function KeyStatusFilterBar({
  locales,
  locale,
  statuses,
  counts,
  unavailable,
  query,
  onLocaleChange,
  onToggleStatus,
  onQueryChange,
}: KeyStatusFilterBarProps): ReactNode {
  return (
    <FilterBar label="Key filters" className="mb-4">
      <SearchInput
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
      <fieldset className="m-0 flex flex-wrap items-center gap-1.5 border-0 p-0">
        <legend className="sr-only">Show only keys that are</legend>
        {KEY_STATUSES.map((status) => {
          const pressed = statuses.has(status);
          const off = unavailable.has(status);
          return (
            <button
              key={status}
              type="button"
              className={cn(TOGGLE_CLASSNAME, pressed && PRESSED_CLASSNAME)}
              aria-pressed={pressed}
              disabled={off}
              title={off ? "Not available right now" : undefined}
              data-status-filter={status}
              onClick={() => onToggleStatus(status)}
            >
              {KEY_STATUS_LABELS[status]}
              <span className="font-mono tabular-nums">{off ? "…" : counts[status]}</span>
            </button>
          );
        })}
      </fieldset>
    </FilterBar>
  );
}
