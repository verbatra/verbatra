import { describe, expect, it } from "vitest";
import type { DiffLocale } from "./diff-view.js";
import {
  attentionEntryCount,
  attentionKeys,
  type KeyStatus,
  type KeyStatusSources,
  type KeyTableInput,
  keyStatusIndex,
  keyTableRows,
  type LocaleIntegrityData,
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

const LOCALES = [DE, FR];
const INDEX = keyStatusIndex(LOCALES, SOURCES);

const VALUES = [
  {
    locale: "de",
    keys: ["a.missing", "a.changed", "a.broken", "a.synced"],
    values: {
      "a.missing": { source: "Cart" },
      "a.changed": { source: "Bag", target: "Tasche" },
      "a.broken": { source: "Hi {name}", target: "Hallo" },
      "a.synced": { source: "Shop", target: "Laden" },
    },
  },
  {
    locale: "fr",
    keys: ["a.missing", "a.old", "a.synced"],
    values: {
      "a.missing": { source: "Cart" },
      "a.old": { target: "Panier" },
      "a.synced": { source: "Shop", target: "Boutique" },
    },
  },
];

function table(overrides: Partial<KeyTableInput> = {}) {
  return keyTableRows({
    locales: LOCALES,
    index: INDEX,
    localeValues: VALUES,
    locale: "",
    statuses: new Set(),
    query: "",
    ...overrides,
  });
}

describe("keyStatusIndex", () => {
  it("indexes each locale's keys by diff state, protection, review queue and integrity problem", () => {
    expect([...(INDEX.get("de")?.get("a.changed") ?? [])]).toEqual(["changed", "protected"]);
    expect([...(INDEX.get("de")?.get("a.broken") ?? [])]).toEqual(["changed", "integrity"]);
    expect([...(INDEX.get("de")?.get("a.flagged") ?? [])]).toEqual(["review"]);
    expect([...(INDEX.get("fr")?.get("a.old") ?? [])]).toEqual(["orphaned"]);
  });

  it("holds no entry for a key that is in sync, and nothing for a locale without data", () => {
    expect(INDEX.get("de")?.has("a.synced")).toBe(false);
    expect(keyStatusIndex([FR], { review: [], integrity: [] }).get("fr")?.has("a.other")).toBe(
      false,
    );
  });
});

describe("attentionKeys", () => {
  it("unions the keys that need attention across the scoped locales", () => {
    expect([...attentionKeys(INDEX, ["de", "fr"])].sort()).toEqual([
      "a.broken",
      "a.changed",
      "a.flagged",
      "a.missing",
      "a.old",
      "a.other",
    ]);
  });

  it("limits the union to the scope and ignores an unknown locale", () => {
    expect([...attentionKeys(INDEX, ["fr", "xx"])].sort()).toEqual([
      "a.missing",
      "a.old",
      "a.other",
    ]);
  });
});

describe("keyTableRows", () => {
  it("lists exactly the keys that need attention when nothing is filtered or searched", () => {
    expect(table().items).toEqual([
      "a.broken",
      "a.changed",
      "a.flagged",
      "a.missing",
      "a.old",
      "a.other",
    ]);
    expect(table().items).not.toContain("a.synced");
  });

  it("scopes the rows to the chosen locale", () => {
    expect(table({ locale: "fr" }).items).toEqual(["a.missing", "a.old", "a.other"]);
  });

  it("counts keys, not key and locale pairs, so a key missing in two locales counts once", () => {
    const counts = table().counts;

    expect(counts.missing).toBe(1);
    expect(counts.changed).toBe(2);
    expect(counts.orphaned).toBe(1);
    expect(counts.protected).toBe(1);
    expect(counts.review).toBe(2);
    expect(counts.integrity).toBe(1);
  });

  it("counts only the chosen locale's keys", () => {
    expect(table({ locale: "fr" }).counts).toMatchObject({ missing: 1, orphaned: 1, changed: 0 });
  });

  it("narrows to the chosen statuses and combines several as a union", () => {
    expect(table({ statuses: new Set<KeyStatus>(["integrity"]) }).items).toEqual(["a.broken"]);
    expect(table({ statuses: new Set<KeyStatus>(["orphaned", "review"]) }).items).toEqual([
      "a.flagged",
      "a.old",
      "a.other",
    ]);
  });

  it("keeps the chip counts at what is available before the status choice", () => {
    expect(table({ statuses: new Set<KeyStatus>(["integrity"]) }).counts.missing).toBe(1);
  });

  it("finds a key that is in sync when a search names it, by key, source or translation", () => {
    expect(table({ query: "synced" }).items).toEqual(["a.synced"]);
    expect(table({ query: "laden" }).items).toEqual(["a.synced"]);
    expect(table({ query: "boutique" }).items).toEqual(["a.synced"]);
    expect(table({ query: "shop" }).items).toEqual(["a.synced"]);
  });

  it("finds an in-sync key in the chosen locale only when that locale holds the text", () => {
    expect(table({ query: "boutique", locale: "de" }).items).toEqual([]);
    expect(table({ query: "boutique", locale: "fr" }).items).toEqual(["a.synced"]);
  });

  it("searches the whole catalogue but still lets a status narrow the matches", () => {
    expect(table({ query: "a.", statuses: new Set<KeyStatus>(["missing"]) }).items).toEqual([
      "a.missing",
    ]);
  });

  it("counts only the keys the search matches on each status", () => {
    const counts = table({ query: "cart" }).counts;

    expect(counts.missing).toBe(1);
    expect(counts.changed).toBe(0);
    expect(counts.orphaned).toBe(0);
  });

  it("treats a blank search as no search", () => {
    expect(table({ query: "   " }).items).toEqual(table().items);
  });

  it("falls back to the attention keys while the locale values have not loaded", () => {
    expect(table({ localeValues: [], query: "a." }).items).toEqual(table().items);
  });

  it("caps the rows at the render limit and reports the true total", () => {
    const many = Array.from({ length: 520 }, (_, i) => `k.${String(i).padStart(4, "0")}`);
    const big: DiffLocale = { ...DE, missing: many, changed: [], protected: [] };
    const capped = keyTableRows({
      locales: [big],
      index: keyStatusIndex([big], { review: [], integrity: [] }),
      localeValues: [],
      locale: "",
      statuses: new Set(),
      query: "",
    });

    expect(capped.items).toHaveLength(500);
    expect(capped.totalMatches).toBe(520);
    expect(capped.truncated).toBe(true);
  });
});

describe("toggleStatus", () => {
  it("toggles a status on and off without touching the input", () => {
    const start: ReadonlySet<KeyStatus> = new Set(["missing"]);

    expect([...toggleStatus(start, "review")]).toEqual(["missing", "review"]);
    expect([...toggleStatus(start, "missing")]).toEqual([]);
    expect([...start]).toEqual(["missing"]);
  });
});

describe("attentionEntryCount", () => {
  it("adds the missing, changed and orphaned entries of every locale", () => {
    const locales: readonly DiffLocale[] = [
      { ...DE, orphaned: ["a.old"] },
      { ...FR, orphaned: ["b.old", "b.older"] },
    ];

    expect(attentionEntryCount(locales)).toBe(7);
  });

  it("ignores the protected, review and integrity groups, which are not drift", () => {
    expect(
      attentionEntryCount([{ ...DE, missing: [], changed: [], protected: ["a.changed"] }]),
    ).toBe(0);
  });
});
