import type { RpcResultFor } from "../shared/rpc/contract.js";
import type { DiffLocale } from "./diff-view.js";
import {
  type CappedKeyList,
  filterAndCapKeys,
  type KeyPairLookup,
  keyMatchesQuery,
} from "./filter.js";
import { hasIntegrityProblem } from "./integrity-pill.js";
import type { LocaleValuesData } from "./locale-values.js";
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

const NO_STATUSES: ReadonlySet<KeyStatus> = new Set();

export function emptyKeyCounts(): Record<KeyStatus, number> {
  return { missing: 0, changed: 0, orphaned: 0, protected: 0, review: 0, integrity: 0 };
}

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
  return [...heldByKey(index, scope).keys()];
}

function heldByKey(
  index: KeyStatusIndex,
  scope: readonly string[],
): ReadonlyMap<string, ReadonlySet<KeyStatus>> {
  const union = new Map<string, Set<KeyStatus>>();
  for (const locale of scope) {
    for (const [key, held] of index.get(locale) ?? []) {
      let merged = union.get(key);
      if (merged === undefined) {
        merged = new Set<KeyStatus>();
        union.set(key, merged);
      }
      for (const status of held) {
        merged.add(status);
      }
    }
  }
  return union;
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

function lookupFor(localeValues: LocaleValuesData, locale: string): KeyPairLookup {
  const record = localeValues.find((entry) => entry.locale === locale)?.values;
  return {
    get: (key) => (record !== undefined && Object.hasOwn(record, key) ? record[key] : undefined),
  };
}

function recordedKeys(localeValues: LocaleValuesData, scope: readonly string[]): readonly string[] {
  return localeValues
    .filter((entry) => scope.includes(entry.locale))
    .flatMap((entry) => Object.keys(entry.values));
}

export function keyTableRows(input: KeyTableInput): KeyTableRows {
  const { index, localeValues, statuses, query } = input;
  const scope = input.locale === "" ? input.locales.map((entry) => entry.locale) : [input.locale];
  const held = heldByKey(index, scope);
  const universe = new Set(held.keys());
  if (query.trim() !== "") {
    for (const key of recordedKeys(localeValues, scope)) {
      universe.add(key);
    }
  }
  const lookups = scope.map((locale) => lookupFor(localeValues, locale));
  const counts = emptyKeyCounts();
  const narrowed: string[] = [];
  for (const key of universe) {
    if (!lookups.some((lookup) => keyMatchesQuery(key, query, lookup))) {
      continue;
    }
    const keyStatuses = held.get(key) ?? NO_STATUSES;
    for (const status of keyStatuses) {
      counts[status] += 1;
    }
    if (statuses.size === 0 || [...keyStatuses].some((status) => statuses.has(status))) {
      narrowed.push(key);
    }
  }
  return { ...filterAndCapKeys(narrowed.sort(), ""), counts };
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
