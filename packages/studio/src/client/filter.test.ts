import { describe, expect, it } from "vitest";
import { filterAndCapKeys, type KeyValuePair, MAX_RENDERED_KEYS } from "./filter.js";

function keysNamed(count: number): readonly string[] {
  return Array.from({ length: count }, (_, index) => `key.${index.toString().padStart(6, "0")}`);
}

describe("filterAndCapKeys", () => {
  it("returns an empty result for an empty list", () => {
    const result = filterAndCapKeys([], "");

    expect(result).toEqual({ items: [], totalMatches: 0, truncated: false });
  });

  it("does not truncate a list of exactly the cap size", () => {
    const keys = keysNamed(MAX_RENDERED_KEYS);

    const result = filterAndCapKeys(keys, "");

    expect(result.items).toEqual(keys);
    expect(result.totalMatches).toBe(MAX_RENDERED_KEYS);
    expect(result.truncated).toBe(false);
  });

  it("truncates a list one over the cap size, keeping the first 500 in order", () => {
    const keys = keysNamed(MAX_RENDERED_KEYS + 1);

    const result = filterAndCapKeys(keys, "");

    expect(result.items).toEqual(keys.slice(0, MAX_RENDERED_KEYS));
    expect(result.items).toHaveLength(MAX_RENDERED_KEYS);
    expect(result.totalMatches).toBe(MAX_RENDERED_KEYS + 1);
    expect(result.truncated).toBe(true);
  });

  it("filters over the full list before capping, not a pre-truncated prefix", () => {
    const keys = [...keysNamed(MAX_RENDERED_KEYS), "needle.only.match"];

    const result = filterAndCapKeys(keys, "needle");

    expect(result.items).toEqual(["needle.only.match"]);
    expect(result.totalMatches).toBe(1);
    expect(result.truncated).toBe(false);
  });

  it("matches case-insensitively", () => {
    const result = filterAndCapKeys(["Greeting.Hello", "farewell.bye"], "GREETING");

    expect(result.items).toEqual(["Greeting.Hello"]);
  });

  it("treats a blank or whitespace-only query as no filter", () => {
    const keys = ["b.key", "a.key"];

    expect(filterAndCapKeys(keys, "")).toEqual({
      items: keys,
      totalMatches: 2,
      truncated: false,
    });
    expect(filterAndCapKeys(keys, "   ")).toEqual({
      items: keys,
      totalMatches: 2,
      truncated: false,
    });
  });

  it("preserves input order among matches, never re-sorting", () => {
    const keys = ["zebra.one", "apple.one", "mango.one"];

    const result = filterAndCapKeys(keys, "one");

    expect(result.items).toEqual(["zebra.one", "apple.one", "mango.one"]);
  });

  it("matches on a key's source value when the key name does not match", () => {
    const keys = ["greeting.hello", "greeting.bye"];
    const values = new Map<string, KeyValuePair>([
      ["greeting.hello", { source: "Welcome to the store" }],
    ]);

    const result = filterAndCapKeys(keys, "welcome", values);

    expect(result).toEqual({ items: ["greeting.hello"], totalMatches: 1, truncated: false });
  });

  it("matches on a key's target value when neither the key name nor the source match", () => {
    const keys = ["greeting.hello", "greeting.bye"];
    const values = new Map<string, KeyValuePair>([
      ["greeting.hello", { source: "Welcome", target: "Willkommen" }],
    ]);

    const result = filterAndCapKeys(keys, "willkommen", values);

    expect(result.items).toEqual(["greeting.hello"]);
  });

  it("still matches on the key name when the query does not appear in any value", () => {
    const keys = ["greeting.hello", "greeting.bye"];
    const values = new Map<string, KeyValuePair>([
      ["greeting.hello", { source: "Welcome" }],
      ["greeting.bye", { source: "Farewell" }],
    ]);

    const result = filterAndCapKeys(keys, "hello", values);

    expect(result.items).toEqual(["greeting.hello"]);
  });

  it("produces no false positive for a key whose value and name both miss the query", () => {
    const keys = ["greeting.hello", "greeting.bye"];
    const values = new Map<string, KeyValuePair>([
      ["greeting.hello", { source: "Welcome" }],
      ["greeting.bye", { source: "Farewell" }],
    ]);

    expect(filterAndCapKeys(keys, "nonexistent", values).items).toEqual([]);
  });

  it("tolerates a key with no entry in the values map (falls back to key-only matching)", () => {
    const keys = ["greeting.hello", "greeting.bye"];
    const values = new Map<string, KeyValuePair>([["greeting.bye", { source: "Farewell" }]]);

    expect(filterAndCapKeys(keys, "hello", values).items).toEqual(["greeting.hello"]);
  });

  it("falls back to key-only matching when no values map is supplied at all", () => {
    const keys = ["greeting.hello", "greeting.bye"];

    expect(filterAndCapKeys(keys, "welcome").items).toEqual([]);
  });

  it("tolerates an orphaned key whose value pair has no source, matching on target instead", () => {
    const keys = ["legacy.orphan"];
    const values = new Map<string, KeyValuePair>([
      ["legacy.orphan", { target: "Alte Übersetzung" }],
    ]);

    expect(filterAndCapKeys(keys, "übersetzung", values).items).toEqual(["legacy.orphan"]);
  });

  it("filters over the full list before capping even when only values match, not keys", () => {
    const decoyKeys = keysNamed(MAX_RENDERED_KEYS);
    const keys = [...decoyKeys, "needle.value.only"];
    const values = new Map<string, KeyValuePair>([
      ["needle.value.only", { source: "a very specific needle string" }],
    ]);

    const result = filterAndCapKeys(keys, "needle", values);

    expect(result).toEqual({
      items: ["needle.value.only"],
      totalMatches: 1,
      truncated: false,
    });
  });

  it("counts value matches toward totalMatches and truncated, same as key matches", () => {
    const keys = keysNamed(MAX_RENDERED_KEYS + 1);
    const values = new Map<string, KeyValuePair>(
      keys.map((key) => [key, { source: `value for ${key}` }] as const),
    );

    const result = filterAndCapKeys(keys, "value for", values);

    expect(result.totalMatches).toBe(MAX_RENDERED_KEYS + 1);
    expect(result.truncated).toBe(true);
    expect(result.items).toHaveLength(MAX_RENDERED_KEYS);
  });
});
