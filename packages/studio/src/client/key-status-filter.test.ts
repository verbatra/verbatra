import { describe, expect, it } from "vitest";
import type { DiffLocale } from "./diff-view.js";
import {
  isKeyFilterActive,
  isLocaleListed,
  type KeyGroups,
  type KeyStatus,
  type KeyStatusFilter,
  type KeyStatusSources,
  keyGroupsFor,
  type LocaleIntegrityData,
  listedStatuses,
  queryMatcher,
  statusCounts,
  toggleStatus,
} from "./key-status-filter.js";

const DE: DiffLocale = {
  locale: "de",
  missing: ["a.missing"],
  changed: ["a.changed", "a.broken"],
  orphaned: [],
  hasPendingChanges: true,
  protected: ["a.changed"],
};

const FR: DiffLocale = {
  locale: "fr",
  missing: ["a.missing"],
  changed: [],
  orphaned: ["a.old"],
  hasPendingChanges: true,
};

function verdict(key: string, matches: boolean): LocaleIntegrityData[number]["entries"][number] {
  return {
    key,
    hasPlaceholders: true,
    matches,
    missing: matches ? [] : ["{name}"],
    extra: [],
    icuValid: true,
    icuArmsMatch: true,
    icuArmDetails: [],
    markupMatches: true,
    markupDetails: [],
  };
}

const SOURCES: KeyStatusSources = {
  review: [
    { locale: "de", key: "a.flagged" },
    { locale: "fr", key: "a.other" },
  ],
  integrity: [{ locale: "de", entries: [verdict("a.changed", true), verdict("a.broken", false)] }],
};

function filter(locale: string | null, statuses: readonly KeyStatus[] = []): KeyStatusFilter {
  return { locale, statuses: new Set(statuses) };
}

describe("keyGroupsFor", () => {
  it("groups a locale's keys by diff state, review queue, and integrity problem", () => {
    expect(keyGroupsFor(DE, SOURCES)).toEqual({
      missing: ["a.missing"],
      changed: ["a.changed", "a.broken"],
      orphaned: [],
      protected: ["a.changed"],
      review: ["a.flagged"],
      integrity: ["a.broken"],
    });
  });

  it("reads a locale without protected keys or integrity data as empty groups", () => {
    const groups = keyGroupsFor(FR, SOURCES);

    expect(groups.protected).toEqual([]);
    expect(groups.integrity).toEqual([]);
    expect(groups.review).toEqual(["a.other"]);
  });
});

describe("listedStatuses", () => {
  const groups: KeyGroups = keyGroupsFor(FR, { review: [], integrity: [] });

  it("always lists the diff groups and adds the others only when they hold keys", () => {
    expect(listedStatuses(groups, filter(null))).toEqual(["missing", "changed", "orphaned"]);
    expect(listedStatuses(keyGroupsFor(DE, SOURCES), filter(null))).toEqual([
      "missing",
      "changed",
      "orphaned",
      "protected",
      "review",
      "integrity",
    ]);
  });

  it("lists exactly the chosen statuses, in their fixed order", () => {
    expect(listedStatuses(groups, filter(null, ["integrity", "missing"]))).toEqual([
      "missing",
      "integrity",
    ]);
  });
});

describe("isLocaleListed", () => {
  const de = keyGroupsFor(DE, SOURCES);

  it("lists every locale while nothing is filtered", () => {
    expect(isLocaleListed("de", de, filter(null))).toBe(true);
  });

  it("drops a locale other than the chosen one", () => {
    expect(isLocaleListed("de", de, filter("fr"))).toBe(false);
    expect(isLocaleListed("de", de, filter("de"))).toBe(true);
  });

  it("drops a locale with no key in any chosen status", () => {
    expect(isLocaleListed("de", de, filter(null, ["orphaned"]))).toBe(false);
    expect(isLocaleListed("de", de, filter(null, ["orphaned", "integrity"]))).toBe(true);
  });
});

describe("statusCounts", () => {
  it("adds up every locale, or only the chosen one", () => {
    expect(statusCounts([DE, FR], SOURCES, null)).toEqual({
      missing: 2,
      changed: 2,
      orphaned: 1,
      protected: 1,
      review: 2,
      integrity: 1,
    });
    expect(statusCounts([DE, FR], SOURCES, "fr")).toMatchObject({ missing: 1, integrity: 0 });
  });
});

describe("filter state", () => {
  it("toggles a status on and off without touching the input", () => {
    const start: ReadonlySet<KeyStatus> = new Set(["missing"]);

    expect([...toggleStatus(start, "review")]).toEqual(["missing", "review"]);
    expect([...toggleStatus(start, "missing")]).toEqual([]);
    expect([...start]).toEqual(["missing"]);
  });

  it("counts a locale or any status as an active filter", () => {
    expect(isKeyFilterActive(filter(null))).toBe(false);
    expect(isKeyFilterActive(filter("de"))).toBe(true);
    expect(isKeyFilterActive(filter(null, ["review"]))).toBe(true);
  });
});

describe("key status filter: search", () => {
  const values = [
    { locale: "de", values: { "a.missing": { source: "Cart" }, "a.changed": { target: "Korb" } } },
    { locale: "fr", values: { "a.old": { target: "Panier" } } },
  ];

  it("matches keys, source and target text per locale, and everything for an empty query", () => {
    const matches = queryMatcher(values, "korb");

    expect(matches("de", "a.changed")).toBe(true);
    expect(matches("de", "a.missing")).toBe(false);
    expect(matches("fr", "a.changed")).toBe(false);
    expect(queryMatcher(values, "  ")("fr", "anything")).toBe(true);
  });

  it("counts only the keys the search matches", () => {
    const counts = statusCounts([DE, FR], SOURCES, null, queryMatcher(values, "cart"));

    expect(counts.missing).toBe(1);
    expect(counts.changed).toBe(0);
    expect(counts.orphaned).toBe(0);
  });

  it("hides a locale without a match and lists only the groups that have one", () => {
    const matches = queryMatcher(values, "panier");
    const filter: KeyStatusFilter = { locale: null, statuses: new Set() };
    const de = keyGroupsFor(DE, SOURCES, matches);
    const fr = keyGroupsFor(FR, SOURCES, matches);

    expect(isLocaleListed("de", de, filter, true)).toBe(false);
    expect(isLocaleListed("fr", fr, filter, true)).toBe(true);
    expect(listedStatuses(fr, filter, true)).toEqual(["orphaned"]);
  });
});
