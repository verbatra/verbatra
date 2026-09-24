import type { RpcResultFor } from "../shared/rpc/contract.js";
import type { DiffLocale } from "./diff-view.js";
import { hasIntegrityProblem } from "./integrity-pill.js";
import type { ReviewOverlayEntry } from "./review-overlay.js";

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
  protected: "Needs review",
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
  readonly review: readonly ReviewOverlayEntry[];
  readonly integrity: LocaleIntegrityData;
}

export function keyGroupsFor(locale: DiffLocale, sources: KeyStatusSources): KeyGroups {
  const integrity = sources.integrity.find((candidate) => candidate.locale === locale.locale);
  return {
    missing: locale.missing,
    changed: locale.changed,
    orphaned: locale.orphaned,
    protected: locale.protected ?? [],
    review: sources.review.filter((row) => row.locale === locale.locale).map((row) => row.key),
    integrity: (integrity?.entries ?? [])
      .filter((entry) => hasIntegrityProblem(entry))
      .map((entry) => entry.key),
  };
}

export function isKeyFilterActive(filter: KeyStatusFilter): boolean {
  return filter.locale !== null || filter.statuses.size > 0;
}

export function listedStatuses(groups: KeyGroups, filter: KeyStatusFilter): readonly KeyStatus[] {
  if (filter.statuses.size > 0) {
    return KEY_STATUSES.filter((status) => filter.statuses.has(status));
  }
  return KEY_STATUSES.filter((status) => ALWAYS_LISTED.has(status) || groups[status].length > 0);
}

export function isLocaleListed(
  locale: string,
  groups: KeyGroups,
  filter: KeyStatusFilter,
): boolean {
  if (filter.locale !== null && filter.locale !== locale) {
    return false;
  }
  return (
    filter.statuses.size === 0 ||
    KEY_STATUSES.some((status) => filter.statuses.has(status) && groups[status].length > 0)
  );
}

export function statusCounts(
  locales: readonly DiffLocale[],
  sources: KeyStatusSources,
  locale: string | null,
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
    const groups = keyGroupsFor(entry, sources);
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
