import { cpuScalingRatio, LINEAR_MAX_RATIO } from "@verbatra/config/scaling";
import { checkPlaceholders } from "@verbatra/core";
import { describe, expect, it } from "vitest";
import { extractPropertiesPlaceholders } from "./placeholders.js";

describe("extractPropertiesPlaceholders", () => {
  it("extracts positional tokens in document order", () => {
    expect(extractPropertiesPlaceholders("{0} then {1}")).toEqual(["{0}", "{1}"]);
  });

  it("extracts named tokens and normalizes inner whitespace", () => {
    expect(extractPropertiesPlaceholders("Hi { name }")).toEqual(["{name}"]);
  });

  it("preserves every occurrence as a multiset, not deduplicated", () => {
    expect(extractPropertiesPlaceholders("{0} of {0}")).toEqual(["{0}", "{0}"]);
  });

  it("returns an empty array for a value with no interpolation", () => {
    expect(extractPropertiesPlaceholders("plain text")).toEqual([]);
  });

  it("does not treat double-brace text as a placeholder", () => {
    expect(extractPropertiesPlaceholders("{{count}}")).toEqual([]);
  });

  it("rejects a dropped repeated occurrence through the integrity check", () => {
    const source = extractPropertiesPlaceholders("{0} of {0}");
    const translated = extractPropertiesPlaceholders("{0} total");
    const result = checkPlaceholders(source, translated);
    expect(result.matches).toBe(false);
    expect(result.missing).toEqual(["{0}"]);
  });

  it("rejects a duplicated token through the integrity check", () => {
    const source = extractPropertiesPlaceholders("{0} apples");
    const translated = extractPropertiesPlaceholders("{0} and {0} apples");
    const result = checkPlaceholders(source, translated);
    expect(result.matches).toBe(false);
    expect(result.extra).toEqual(["{0}"]);
  });

  it("accepts a faithful translation that preserves every occurrence", () => {
    const source = extractPropertiesPlaceholders("{0} of {0}");
    const translated = extractPropertiesPlaceholders("{0} von {0}");
    expect(checkPlaceholders(source, translated).matches).toBe(true);
  });

  it("keeps the type and style of a numeric MessageFormat argument in the token", () => {
    expect(extractPropertiesPlaceholders("You have {0,number,integer} points")).toEqual([
      "{0,number,integer}",
    ]);
  });

  it("keeps the style of a date MessageFormat argument in the token", () => {
    expect(extractPropertiesPlaceholders("Due {0,date,short}")).toEqual(["{0,date,short}"]);
  });

  it("keeps the style of a currency MessageFormat argument in the token", () => {
    expect(extractPropertiesPlaceholders("Total {0,number,currency}")).toEqual([
      "{0,number,currency}",
    ]);
  });

  it("normalizes insignificant whitespace around the type and style", () => {
    expect(extractPropertiesPlaceholders("{0, number, integer }")).toEqual(["{0,number,integer}"]);
  });

  it("extracts a typed argument that has no style", () => {
    expect(extractPropertiesPlaceholders("{count,number}")).toEqual(["{count,number}"]);
  });

  it("emits a header for a sub-message type with no style body", () => {
    expect(extractPropertiesPlaceholders("{0,plural}")).toEqual(["{0,plural}"]);
  });

  it("emits a header token for a plural argument and recurses into its sub-messages", () => {
    expect(
      extractPropertiesPlaceholders("{count,plural, one {{name} item} other {{name} items}}"),
    ).toEqual(["{count,plural}", "{name}", "{name}"]);
  });

  it("treats a hash-only plural body as having no nested arguments", () => {
    expect(extractPropertiesPlaceholders("{count,plural, one {# item} other {# items}}")).toEqual([
      "{count,plural}",
    ]);
  });

  it("accepts a faithful plural translation whose branch text changed", () => {
    const source = extractPropertiesPlaceholders("{count,plural, one {# item} other {# items}}");
    const translated = extractPropertiesPlaceholders(
      "{count,plural, one {# Artikel} other {# Artikel}}",
    );
    expect(checkPlaceholders(source, translated).matches).toBe(true);
  });

  it("rejects a translation that drops a numeric MessageFormat argument", () => {
    const source = extractPropertiesPlaceholders("You have {0,number,integer} points");
    const translated = extractPropertiesPlaceholders("You have points");
    const result = checkPlaceholders(source, translated);
    expect(result.matches).toBe(false);
    expect(result.missing).toEqual(["{0,number,integer}"]);
  });

  it("rejects a translation that alters a numeric argument's style", () => {
    const source = extractPropertiesPlaceholders("{0,number,integer}");
    const translated = extractPropertiesPlaceholders("{0,number,currency}");
    const result = checkPlaceholders(source, translated);
    expect(result.matches).toBe(false);
    expect(result.missing).toEqual(["{0,number,integer}"]);
    expect(result.extra).toEqual(["{0,number,currency}"]);
  });

  it("rejects a translation that renames a plural argument", () => {
    const source = extractPropertiesPlaceholders("{count,plural, one {# item} other {# items}}");
    const translated = extractPropertiesPlaceholders(
      "{total,plural, one {# item} other {# items}}",
    );
    const result = checkPlaceholders(source, translated);
    expect(result.matches).toBe(false);
    expect(result.missing).toEqual(["{count,plural}"]);
    expect(result.extra).toEqual(["{total,plural}"]);
  });

  it("does not extract an argument with an unbalanced brace", () => {
    expect(extractPropertiesPlaceholders("start {0 no close")).toEqual([]);
  });

  it("does not treat a non-identifier body as an argument", () => {
    expect(extractPropertiesPlaceholders("{not a name}")).toEqual([]);
  });

  it("does not treat a typed body with an invalid name as an argument", () => {
    expect(extractPropertiesPlaceholders("{bad name,number}")).toEqual([]);
  });

  it("reads a single-quoted MessageFormat literal as an argument (documented limitation)", () => {
    expect(extractPropertiesPlaceholders("'{0}'")).toEqual(["{0}"]);
  });

  it("reads the inner argument of a stray double-close (documented limitation)", () => {
    expect(extractPropertiesPlaceholders("{0}}")).toEqual(["{0}"]);
  });

  it("extracts a large unbalanced-brace value in bounded time (algorithmic-DoS guard)", () => {
    const value = "{a".repeat(200_000);
    expect(extractPropertiesPlaceholders(value)).toEqual([]);
    expect(cpuScalingRatio(extractPropertiesPlaceholders, "{a".repeat(25_000), value)).toBeLessThan(
      LINEAR_MAX_RATIO,
    );
  });

  it("extracts a deeply nested balanced sub-message value in bounded time", () => {
    const nested = (n: number) => `{0,plural,other{${"{".repeat(n)}${"}".repeat(n)}}}`;
    const value = nested(100_000);
    expect(extractPropertiesPlaceholders(value)).toEqual(["{0,plural}"]);
    expect(cpuScalingRatio(extractPropertiesPlaceholders, nested(12_500), value)).toBeLessThan(
      LINEAR_MAX_RATIO,
    );
  });
});
