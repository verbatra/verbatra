import { describe, expect, it } from "vitest";
import {
  type LocaleValuesData,
  localeValuesOrEmpty,
  toLocaleValuesOutcome,
  valuesForLocale,
  valuesIndex,
} from "./locale-values.js";

const DATA: LocaleValuesData = [
  {
    locale: "de",
    values: {
      "greeting.hello": { source: "Hello", target: "Hallo" },
      "greeting.bye": { source: "Bye" },
    },
  },
  {
    locale: "fr",
    values: {
      "greeting.hello": { source: "Hello", target: "Bonjour" },
    },
  },
];

describe("toLocaleValuesOutcome", () => {
  it("passes through a successful result unchanged", () => {
    expect(toLocaleValuesOutcome({ ok: true, result: DATA })).toEqual({ ok: true, result: DATA });
  });

  it("passes through a transport or domain error unchanged", () => {
    const error = { code: "SESSION_EXPIRED", message: "expired" };
    expect(toLocaleValuesOutcome({ ok: false, error })).toEqual({ ok: false, error });
  });
});

describe("valuesForLocale", () => {
  it("returns a lookup map of that locale's key values", () => {
    const map = valuesForLocale(DATA, "de");
    expect(map.get("greeting.hello")).toEqual({ source: "Hello", target: "Hallo" });
    expect(map.get("greeting.bye")).toEqual({ source: "Bye" });
  });

  it("returns an empty map for a locale not present in the data", () => {
    expect(valuesForLocale(DATA, "es").size).toBe(0);
  });

  it("returns an empty map for an empty data set", () => {
    expect(valuesForLocale([], "de").size).toBe(0);
  });
});

describe("valuesIndex", () => {
  it("keys every locale's values by a composite locale and key lookup", () => {
    const index = valuesIndex(DATA);
    expect(index.get("de\tgreeting.hello")).toEqual({ source: "Hello", target: "Hallo" });
    expect(index.get("fr\tgreeting.hello")).toEqual({ source: "Hello", target: "Bonjour" });
  });

  it("does not conflate the same key across two different locales", () => {
    const index = valuesIndex(DATA);
    expect(index.get("de\tgreeting.hello")).not.toEqual(index.get("fr\tgreeting.hello"));
  });

  it("is empty for an empty data set", () => {
    expect(valuesIndex([]).size).toBe(0);
  });
});

describe("localeValuesOrEmpty", () => {
  it("returns the data for a loaded view", () => {
    expect(localeValuesOrEmpty({ kind: "data", data: DATA, stale: false })).toBe(DATA);
  });

  it("returns an empty array while loading", () => {
    expect(localeValuesOrEmpty({ kind: "loading" })).toEqual([]);
  });

  it("returns an empty array on a hard error", () => {
    expect(
      localeValuesOrEmpty({ kind: "error", error: { code: "INTERNAL", message: "boom" } }),
    ).toEqual([]);
  });

  it("returns the stale data rather than an empty array on a stale refresh error", () => {
    expect(
      localeValuesOrEmpty({
        kind: "data",
        data: DATA,
        stale: true,
        error: { code: "INTERNAL", message: "boom" },
      }),
    ).toBe(DATA);
  });
});
