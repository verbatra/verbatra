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

  it("ignores the doubled braces that stand for a literal brace", () => {
    expect(extractResxPlaceholders("{{0}} is literal, {0} is not")).toEqual(["{0}"]);
  });

  it("ignores a named token, which .NET composite formatting has no concept of", () => {
    expect(extractResxPlaceholders("Hello {name}")).toEqual([]);
  });

  it("finds nothing in a value with no items", () => {
    expect(extractResxPlaceholders("plain text")).toEqual([]);
  });
});
