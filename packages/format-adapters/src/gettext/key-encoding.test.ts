import { describe, expect, it } from "vitest";
import { AdapterError } from "../errors.js";
import { composeKey, decomposeKey } from "./key-encoding.js";

describe("decomposeKey: malformed input", () => {
  it("rejects a key whose unescaped bracket suffix is not a plain digit index", () => {
    expect(() => decomposeKey("foo[bar]")).toThrow(AdapterError);
    expect(() => decomposeKey("foo[bar]")).toThrow(/malformed plural-index suffix/);
  });
});

describe("composeKey and decomposeKey round-trip", () => {
  it("round-trips a plain singular msgid with no context", () => {
    const key = composeKey(undefined, "Hello");
    expect(key).toBe("Hello");
    expect(decomposeKey(key)).toEqual({
      msgctxt: undefined,
      msgid: "Hello",
      pluralIndex: undefined,
    });
  });

  it("round-trips a msgctxt-disambiguated msgid", () => {
    const key = composeKey("menu", "Open");
    expect(decomposeKey(key)).toEqual({ msgctxt: "menu", msgid: "Open", pluralIndex: undefined });
  });

  it("round-trips a plural index with no context", () => {
    const key = composeKey(undefined, "item", 2);
    expect(decomposeKey(key)).toEqual({ msgctxt: undefined, msgid: "item", pluralIndex: 2 });
  });

  it("round-trips a plural index combined with a context", () => {
    const key = composeKey("basket", "item", 1);
    expect(decomposeKey(key)).toEqual({ msgctxt: "basket", msgid: "item", pluralIndex: 1 });
  });

  it("distinguishes two contexts sharing the same msgid", () => {
    const a = composeKey("menu", "Open");
    const b = composeKey("dialog", "Open");
    expect(a).not.toBe(b);
    expect(decomposeKey(a).msgctxt).toBe("menu");
    expect(decomposeKey(b).msgctxt).toBe("dialog");
  });

  it.each(["a[0]", "a\\[0]", "a\\\\", "[", "[Deleted]", "Count[1]"] as const)(
    "round-trips the adversarial literal msgid %j",
    (msgid) => {
      const key = composeKey(undefined, msgid);
      expect(decomposeKey(key)).toEqual({ msgctxt: undefined, msgid, pluralIndex: undefined });
    },
  );

  it("does not collide a literal msgid containing a bracket suffix with a real plural key", () => {
    const literalSingular = composeKey(undefined, "Count[1]");
    const realPlural = composeKey(undefined, "Count", 1);
    expect(literalSingular).not.toBe(realPlural);
    expect(decomposeKey(literalSingular)).toEqual({
      msgctxt: undefined,
      msgid: "Count[1]",
      pluralIndex: undefined,
    });
    expect(decomposeKey(realPlural)).toEqual({
      msgctxt: undefined,
      msgid: "Count",
      pluralIndex: 1,
    });
  });

  it("does not collide two different contexts whose escaped forms could otherwise overlap", () => {
    const a = composeKey("a[x", "y");
    const b = composeKey("a", "x]y");
    expect(a).not.toBe(b);
  });

  it("rejects a msgid containing the reserved private-use separator", () => {
    expect(() => composeKey(undefined, "badvalue")).toThrow(AdapterError);
  });

  it("rejects a msgctxt containing the reserved private-use separator", () => {
    expect(() => composeKey("badctx", "value")).toThrow(AdapterError);
  });
});
