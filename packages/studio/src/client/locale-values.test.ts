import { describe, expect, it } from "vitest";
import {
  type LocaleValuesData,
  localeValuesOrEmpty,
  pairFor,
  sourceTextFor,
  toLocaleValuesOutcome,
  valuesIndex,
} from "./locale-values.js";

const DATA: LocaleValuesData = [
  {
    locale: "de",
    keys: ["greeting.hello", "greeting.bye"],
    values: {
      "greeting.hello": { source: "Hello", target: "Hallo" },
      "greeting.bye": { source: "Bye" },
    },
  },
  {
    locale: "fr",
    keys: ["greeting.hello"],
    values: {
      "greeting.hello": { source: "Hello", target: "Bonjour" },
    },
  },
];

describe("toLocaleValuesOutcome", () => {
  it("passes through a successful result unchanged", () => {
    expect(toLocaleValuesOutcome({ ok: true, result: DATA })).toEqual({ ok: true, result: DATA });
  });

  it("reports a single page where every value was asked for as an error", () => {
    const outcome = toLocaleValuesOutcome({ ok: true, result: { locales: [] } });

    expect(outcome).toMatchObject({ ok: false, error: { code: "UNEXPECTED_RESULT" } });
  });

  it("passes through a transport or domain error unchanged", () => {
    const error = { code: "SESSION_EXPIRED", message: "expired" };
    expect(toLocaleValuesOutcome({ ok: false, error })).toEqual({ ok: false, error });
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

describe("locale values: prototype-named keys parsed from the RPC response", () => {
  const parsed = JSON.parse(
    '[{"locale":"de","values":{"__proto__":{"source":"P","target":"Pd"},"constructor":{"source":"C"}}}]',
  ) as LocaleValuesData;

  it("keeps __proto__ and constructor as lookup entries in valuesIndex", () => {
    const index = valuesIndex(parsed);
    expect(index.get("de\t__proto__")).toEqual({ source: "P", target: "Pd" });
    expect(index.get("de\tconstructor")).toEqual({ source: "C" });
  });
});

describe("sourceTextFor", () => {
  const data = [
    { locale: "de", keys: ["a", "b"], values: { a: { target: "A" }, b: { source: "Bee" } } },
    { locale: "fr", keys: ["a"], values: { a: { source: "Ay", target: "Aa" } } },
  ];

  it("reads the source text from the first locale that holds it", () => {
    expect(sourceTextFor(data, "a")).toBe("Ay");
    expect(sourceTextFor(data, "b")).toBe("Bee");
  });

  it("reads nothing for a key no locale holds a source for", () => {
    expect(sourceTextFor(data, "missing")).toBeUndefined();
    expect(sourceTextFor([], "a")).toBeUndefined();
  });
});

describe("pairFor", () => {
  it("reads a key the locale holds, even one named like an object property", () => {
    const values = JSON.parse('{"constructor":{"source":"Builder"},"a":{"source":"A"}}');

    expect(pairFor(values, "a")).toEqual({ source: "A" });
    expect(pairFor(values, "constructor")).toEqual({ source: "Builder" });
  });

  it("reads nothing for an inherited property or a missing locale", () => {
    expect(pairFor({}, "constructor")).toBeUndefined();
    expect(pairFor({}, "toString")).toBeUndefined();
    expect(pairFor(undefined, "a")).toBeUndefined();
  });

  it("keeps sourceTextFor from reading an inherited property", () => {
    expect(sourceTextFor([{ locale: "de", keys: [], values: {} }], "constructor")).toBeUndefined();
  });
});
