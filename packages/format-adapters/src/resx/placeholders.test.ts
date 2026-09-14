import { checkPlaceholders } from "@verbatra/core";
import { describe, expect, it } from "vitest";
import { extractResxPlaceholders } from "./placeholders.js";

describe("extractResxPlaceholders", () => {
  it("extracts a bare index item", () => {
    expect(extractResxPlaceholders("Hello {0} and {1}")).toEqual(["{0}", "{1}"]);
  });

  it("keeps the alignment and the format specifier inside the token", () => {
    expect(extractResxPlaceholders("{0,-10} owes {1:C} by {2:yyyy-MM-dd}")).toEqual([
      "{0,-10}",
      "{1:C}",
      "{2:yyyy-MM-dd}",
    ]);
  });

  it("accepts the whitespace .NET allows around an index and an alignment", () => {
    expect(extractResxPlaceholders("{0 } and {1, -10} and {2 ,3}")).toEqual([
      "{0}",
      "{1,-10}",
      "{2,3}",
    ]);
  });

  it("reports a doubled brace as its own token, so dropping one is visible", () => {
    expect(extractResxPlaceholders("{{0}} is literal, {0} is not")).toEqual(["{{", "}}", "{0}"]);
  });

  it("reports a brace that belongs to no format item as its own token", () => {
    expect(extractResxPlaceholders("Hello {name}")).toEqual(["{", "}"]);
    expect(extractResxPlaceholders("a } b")).toEqual(["}"]);
  });

  it("finds nothing in a value with no braces", () => {
    expect(extractResxPlaceholders("plain text")).toEqual([]);
  });
});

describe("extractResxPlaceholders under the integrity check", () => {
  function gate(source: string, target: string): boolean {
    return checkPlaceholders(extractResxPlaceholders(source), extractResxPlaceholders(target))
      .matches;
  }

  it("rejects a doubled brace unescaped into a single one, which would throw at format time", () => {
    expect(gate("Hi {{ {0}", "Hi { {0}")).toBe(false);
  });

  it("rejects an introduced lone closing brace", () => {
    expect(gate("Hi {0}", "Hi {0}}")).toBe(false);
  });

  it("rejects a dropped alignment or format specifier", () => {
    expect(gate("{0,-10}", "{0}")).toBe(false);
    expect(gate("{0:C}", "{0}")).toBe(false);
  });

  it("accepts a translation that only reorders the items or respaces them", () => {
    expect(gate("{0} then {1}", "{1} dann {0}")).toBe(true);
    expect(gate("{0,-10}", "{0, -10}")).toBe(true);
  });

  it("accepts a faithful translation that keeps every literal brace", () => {
    expect(gate("Use {{ and }} around {0}", "Nutze {{ und }} um {0}")).toBe(true);
  });
});
