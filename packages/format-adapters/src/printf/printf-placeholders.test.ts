import { describe, expect, it } from "vitest";
import { extractPrintfPlaceholders } from "./printf-placeholders.js";

const APPLE_CONVERSIONS = new Set(["@", "d", "i", "u", "x", "X", "o", "f", "s", "c"]);

function extract(value: string): readonly string[] {
  return extractPrintfPlaceholders(value, { conversions: APPLE_CONVERSIONS });
}

describe("extractPrintfPlaceholders", () => {
  it("extracts a plain object specifier", () => {
    expect(extract("Hello %@")).toEqual(["%@"]);
  });

  it("extracts a plain integer specifier", () => {
    expect(extract("You have %d items")).toEqual(["%d"]);
  });

  it("extracts a positional specifier", () => {
    expect(extract("%1$@ has %2$d items")).toEqual(["%1$@", "%2$d"]);
  });

  it("extracts an escaped percent literal", () => {
    expect(extract("100%% done")).toEqual(["%%"]);
  });

  it("extracts every specifier in document order", () => {
    expect(extract("%@ bought %d of %@")).toEqual(["%@", "%d", "%@"]);
  });

  it("does not extract a percent sign followed by a space and ordinary text", () => {
    expect(extract("50% off")).toEqual([]);
  });

  it("does not extract a conversion character not in the configured set", () => {
    const numericOnly = extractPrintfPlaceholders("%y is unsupported", {
      conversions: new Set(["d"]),
    });
    expect(numericOnly).toEqual([]);
  });

  it("drops flags, width, and precision decoration from the canonical token", () => {
    expect(extractPrintfPlaceholders("%05.2f", { conversions: new Set(["f"]) })).toEqual(["%f"]);
  });

  it("drops a length modifier from the canonical token", () => {
    expect(extractPrintfPlaceholders("%ld and %lld", { conversions: new Set(["d"]) })).toEqual([
      "%d",
      "%d",
    ]);
  });

  it("returns an empty list for a value with no percent sign", () => {
    expect(extract("Hello world")).toEqual([]);
  });

  it("returns an empty list for a lone percent sign at the end of a value", () => {
    expect(extract("100%")).toEqual([]);
  });

  it("extracts a large adversarial run of zeros without catastrophic backtracking", () => {
    const adversarial = `%${"0".repeat(200_000)}`;
    expect(extract(adversarial)).toEqual([]);
  }, 2000);

  it("still extracts correctly when a large flag/width run resolves to a valid conversion", () => {
    const adversarial = `%${"0".repeat(200_000)}d`;
    expect(extractPrintfPlaceholders(adversarial, { conversions: new Set(["d"]) })).toEqual(["%d"]);
  }, 2000);
});
