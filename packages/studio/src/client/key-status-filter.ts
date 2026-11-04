import type { RpcResultFor } from "../shared/rpc/contract.js";
import type { DiffLocale } from "./diff-view.js";
import { type CappedKeyList, filterAndCapKeys, keyMatchesQuery } from "./filter.js";
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

export type LocaleIntegrityData = RpcResultFor<"locale.integrity">["locales"];

export interface KeyStatusSources {
  readonly review: readonly ReviewEntryRef[];
  readonly integrity: LocaleIntegrityData;
}

export type KeyStatusesByKey = ReadonlyMap<string, ReadonlySet<KeyStatus>>;

export type KeyStatusIndex = ReadonlyMap<string, KeyStatusesByKey>;

function statusesByKey(locale: DiffLocale, sources: KeyStatusSources): KeyStatusesByKey {
  const found = new Map<string, Set<KeyStatus>>();
  const add = (status: KeyStatus, keys: readonly string[]): void => {
    for (const key of keys) {
      const held = found.get(key) ?? new Set<KeyStatus>();
      held.add(status);
      found.set(key, held);
    }
  };
  const integrity = sources.integrity.find((candidate) => candidate.locale === locale.locale);
  add("missing", locale.missing);
  add("changed", locale.changed);
  add("orphaned", locale.orphaned);
  add("protected", locale.protected ?? []);
  add(
    "review",
    sources.review.filter((row) => row.locale === locale.locale).map((row) => row.key),
  );
  add(
    "integrity",
    (integrity?.entries ?? [])
      .filter((entry) => hasIntegrityProblem(entry))
      .map((entry) => entry.key),
  );
  return found;
}

export function keyStatusIndex(
  locales: readonly DiffLocale[],
  sources: KeyStatusSources,
): KeyStatusIndex {
  return new Map(locales.map((locale) => [locale.locale, statusesByKey(locale, sources)]));
}

export function attentionKeys(index: KeyStatusIndex, scope: readonly string[]): readonly string[] {
  const keys = new Set<string>();
  for (const locale of scope) {
    for (const key of index.get(locale)?.keys() ?? []) {
      keys.add(key);
    }
  }
  return [...keys];
}

export interface KeyTableInput {
  readonly locales: readonly DiffLocale[];
  readonly index: KeyStatusIndex;
  readonly localeValues: LocaleValuesData;
  readonly locale: string;
  readonly statuses: ReadonlySet<KeyStatus>;
  readonly query: string;
}

export interface KeyTableRows extends CappedKeyList {
  readonly counts: Readonly<Record<KeyStatus, number>>;
}

function holdsStatus(
  index: KeyStatusIndex,
  scope: readonly string[],
  key: string,
  wanted: (status: KeyStatus) => boolean,
): boolean {
  return scope.some((locale) => [...(index.get(locale)?.get(key) ?? [])].some(wanted));
}

export function keyTableRows(input: KeyTableInput): KeyTableRows {
  const { index, localeValues, statuses, query } = input;
  const scope = input.locale === "" ? input.locales.map((entry) => entry.locale) : [input.locale];
  const searching = query.trim() !== "";
  const pairs = new Map(scope.map((locale) => [locale, valuesForLocale(localeValues, locale)]));
  const universe = new Set(attentionKeys(index, scope));
  if (searching) {
    for (const pair of pairs.values()) {
      for (const key of pair.keys()) {
        universe.add(key);
      }
    }
  }
  const matching = [...universe]
    .filter((key) => scope.some((locale) => keyMatchesQuery(key, query, pairs.get(locale))))
    .sort();
  const counts: Record<KeyStatus, number> = {
    missing: 0,
    changed: 0,
    orphaned: 0,
    protected: 0,
    review: 0,
    integrity: 0,
  };
  for (const status of KEY_STATUSES) {
    counts[status] = matching.filter((key) =>
      holdsStatus(index, scope, key, (held) => held === status),
    ).length;
  }
  const narrowed =
    statuses.size === 0
      ? matching
      : matching.filter((key) => holdsStatus(index, scope, key, (held) => statuses.has(held)));
  return { ...filterAndCapKeys(narrowed, ""), counts };
}

export function attentionEntryCount(locales: readonly DiffLocale[]): number {
  return locales.reduce(
    (total, locale) =>
      total + locale.missing.length + locale.changed.length + locale.orphaned.length,
    0,
  );
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
