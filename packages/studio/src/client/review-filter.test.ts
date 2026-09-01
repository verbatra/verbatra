import { describe, expect, it } from "vitest";
import type { KeyValuePair } from "./filter.js";
import { filterReviewRows, reviewValuesKey, uniqueReviewLocales } from "./review-filter.js";
import type { ReviewQueueRow } from "./review-queue-data.js";

function row(locale: string, key: string): ReviewQueueRow {
  return { locale, key, reasons: ["EQUALS_SOURCE"] };
}

const ROWS: readonly ReviewQueueRow[] = [
  row("de", "home.title"),
  row("fr", "home.title"),
  row("de", "checkout.cta"),
  row("ar", "home.subtitle"),
];

describe("uniqueReviewLocales", () => {
  it("returns each locale once, sorted", () => {
    expect(uniqueReviewLocales(ROWS)).toEqual(["ar", "de", "fr"]);
  });

  it("is empty for no rows", () => {
    expect(uniqueReviewLocales([])).toEqual([]);
  });
});

describe("filterReviewRows", () => {
  it("returns the rows unchanged for the empty filter", () => {
    expect(filterReviewRows(ROWS, { locale: null, query: "" })).toEqual(ROWS);
  });

  it("pins an exact locale", () => {
    expect(filterReviewRows(ROWS, { locale: "de", query: "" })).toEqual([
      row("de", "home.title"),
      row("de", "checkout.cta"),
    ]);
  });

  it("matches the key case-insensitively as a substring", () => {
    expect(filterReviewRows(ROWS, { locale: null, query: "HOME" })).toEqual([
      row("de", "home.title"),
      row("fr", "home.title"),
      row("ar", "home.subtitle"),
    ]);
  });

  it("treats whitespace-only queries as no filter", () => {
    expect(filterReviewRows(ROWS, { locale: null, query: "   " })).toEqual(ROWS);
  });

  it("combines the locale pin and the key query", () => {
    expect(filterReviewRows(ROWS, { locale: "de", query: "title" })).toEqual([
      row("de", "home.title"),
    ]);
  });

  it("can produce an empty result the caller renders as a no-matches state", () => {
    expect(filterReviewRows(ROWS, { locale: "fr", query: "checkout" })).toEqual([]);
  });

  it("matches a query found only in a row's source value, not its key", () => {
    const values = new Map<string, KeyValuePair>([
      [reviewValuesKey("de", "checkout.cta"), { source: "Proceed to payment" }],
    ]);

    expect(filterReviewRows(ROWS, { locale: null, query: "payment" }, values)).toEqual([
      row("de", "checkout.cta"),
    ]);
  });

  it("matches a query found only in a row's target value, not its key", () => {
    const values = new Map<string, KeyValuePair>([
      [reviewValuesKey("fr", "home.title"), { source: "Home", target: "Accueil" }],
    ]);

    expect(filterReviewRows(ROWS, { locale: null, query: "accueil" }, values)).toEqual([
      row("fr", "home.title"),
    ]);
  });

  it("still matches on the key when a values map is supplied but has no entry for that row", () => {
    const values = new Map<string, KeyValuePair>([
      [reviewValuesKey("de", "checkout.cta"), { source: "Proceed to payment" }],
    ]);

    expect(filterReviewRows(ROWS, { locale: null, query: "home" }, values)).toEqual([
      row("de", "home.title"),
      row("fr", "home.title"),
      row("ar", "home.subtitle"),
    ]);
  });

  it("does not match a row whose value belongs to a different locale for the same key (no false positive)", () => {
    const values = new Map<string, KeyValuePair>([
      [reviewValuesKey("fr", "home.title"), { source: "Home", target: "Accueil" }],
    ]);

    expect(filterReviewRows(ROWS, { locale: null, query: "accueil" }, values)).toEqual([
      row("fr", "home.title"),
    ]);
  });

  it("falls back to key-only matching when no values map is supplied", () => {
    expect(filterReviewRows(ROWS, { locale: null, query: "payment" })).toEqual([]);
  });

  it("matches a query in a row's target value when the pair carries no source (an orphaned-style entry)", () => {
    const values = new Map<string, KeyValuePair>([
      [reviewValuesKey("de", "checkout.cta"), { target: "Nur im Ziel vorhanden" }],
    ]);

    expect(filterReviewRows(ROWS, { locale: null, query: "ziel" }, values)).toEqual([
      row("de", "checkout.cta"),
    ]);
  });

  it("does not match when a values entry exists but neither its source nor target contains the query", () => {
    const values = new Map<string, KeyValuePair>([
      [reviewValuesKey("de", "checkout.cta"), { source: "Proceed", target: "Weiter" }],
    ]);

    expect(filterReviewRows(ROWS, { locale: null, query: "nomatch" }, values)).toEqual([]);
  });
});

describe("reviewValuesKey", () => {
  it("combines locale and key into one composite lookup key", () => {
    expect(reviewValuesKey("de", "home.title")).toBe("de\thome.title");
  });
});
