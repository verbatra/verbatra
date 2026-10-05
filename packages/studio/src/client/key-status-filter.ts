import type { RpcResultFor } from "../shared/rpc/contract.js";
import type { DiffLocale } from "./diff-view.js";
import { keyMatchesQuery } from "./filter.js";
import { hasIntegrityProblem } from "./integrity-pill.js";
import { type LocaleValuesData, valuesForLocale } from "./locale-values.js";
import type { ReviewEntryRef } from "./review-queue-data.js";

export type KeyStatus = "missing" | "changed" | "orphaned" | "protected" | "review" | "integrity";

export const KEY_STATUSES: readonly KeyStatus[] = [
  "missing",
  "changed",
  "orphaned",
  "protected",
  "review",
  "integrity",
];

export const KEY_STATUS_LABELS: Readonly<Record<KeyStatus, string>> = {
  missing: "Missing",
  changed: "Changed",
  orphaned: "Orphaned",
  protected: "Protected",
  review: "Review queue",
  integrity: "Integrity problems",
};

const ALWAYS_LISTED: ReadonlySet<KeyStatus> = new Set(["missing", "changed", "orphaned"]);

export type LocaleIntegrityData = RpcResultFor<"locale.integrity">["locales"];

export type KeyGroups = Readonly<Record<KeyStatus, readonly string[]>>;

export interface KeyStatusFilter {
  readonly locale: string | null;
  readonly statuses: ReadonlySet<KeyStatus>;
}

export interface KeyStatusSources {
  readonly review: readonly ReviewEntryRef[];
  readonly integrity: LocaleIntegrityData;
}

export type KeyMatcher = (locale: string, key: string) => boolean;

const MATCH_ALL: KeyMatcher = () => true;

export function queryMatcher(localeValues: LocaleValuesData, query: string): KeyMatcher {
  if (query.trim() === "") {
    return MATCH_ALL;
  }
  const perLocale = new Map(
    localeValues.map((entry) => [entry.locale, valuesForLocale(localeValues, entry.locale)]),
  );
  return (locale, key) => keyMatchesQuery(key, query, perLocale.get(locale));
}

export function keyGroupsFor(
  locale: DiffLocale,
  sources: KeyStatusSources,
  matches: KeyMatcher = MATCH_ALL,
): KeyGroups {
  const integrity = sources.integrity.find((candidate) => candidate.locale === locale.locale);
  const keep = (keys: readonly string[]): readonly string[] =>
    keys.filter((key) => matches(locale.locale, key));
  return {
    missing: keep(locale.missing),
    changed: keep(locale.changed),
    orphaned: keep(locale.orphaned),
    protected: keep(locale.protected ?? []),
    review: keep(
      sources.review.filter((row) => row.locale === locale.locale).map((row) => row.key),
    ),
    integrity: keep(
      (integrity?.entries ?? [])
        .filter((entry) => hasIntegrityProblem(entry))
        .map((entry) => entry.key),
    ),
  };
}

export function isKeyFilterActive(filter: KeyStatusFilter): boolean {
  return filter.locale !== null || filter.statuses.size > 0;
}

export function listedStatuses(
  groups: KeyGroups,
  filter: KeyStatusFilter,
  searching = false,
): readonly KeyStatus[] {
  if (filter.statuses.size > 0) {
    return KEY_STATUSES.filter((status) => filter.statuses.has(status));
  }
  return KEY_STATUSES.filter(
    (status) => (!searching && ALWAYS_LISTED.has(status)) || groups[status].length > 0,
  );
}

export interface StatusSummaryItem {
  readonly status: KeyStatus;
  readonly count: number;
}

export function localeStatusSummary(
  groups: KeyGroups,
  filter: KeyStatusFilter,
  searching: boolean,
  hasPendingChanges: boolean,
): readonly StatusSummaryItem[] {
  const narrowed = searching || filter.statuses.size > 0;
  return listedStatuses(groups, filter, searching)
    .map((status) => ({ status, count: groups[status].length }))
    .filter((item) => narrowed || hasPendingChanges || item.count > 0);
}

export function isLocaleListed(
  locale: string,
  groups: KeyGroups,
  filter: KeyStatusFilter,
  searching = false,
): boolean {
  if (filter.locale !== null && filter.locale !== locale) {
    return false;
  }
  if (filter.statuses.size > 0) {
    return KEY_STATUSES.some((status) => filter.statuses.has(status) && groups[status].length > 0);
  }
  return !searching || KEY_STATUSES.some((status) => groups[status].length > 0);
}

export function statusCounts(
  locales: readonly DiffLocale[],
  sources: KeyStatusSources,
  locale: string | null,
  matches: KeyMatcher = MATCH_ALL,
): Readonly<Record<KeyStatus, number>> {
  const counts: Record<KeyStatus, number> = {
    missing: 0,
    changed: 0,
    orphaned: 0,
    protected: 0,
    review: 0,
    integrity: 0,
  };
  for (const entry of locales) {
    if (locale !== null && entry.locale !== locale) {
      continue;
    }
    const groups = keyGroupsFor(entry, sources, matches);
    for (const status of KEY_STATUSES) {
      counts[status] += groups[status].length;
    }
  }
  return counts;
}

export function toggleStatus(
  statuses: ReadonlySet<KeyStatus>,
  status: KeyStatus,
): ReadonlySet<KeyStatus> {
  const next = new Set(statuses);
  if (next.has(status)) {
    next.delete(status);
  } else {
    next.add(status);
  }
  return next;
}
