import { describe, expect, it } from "vitest";
import { extractAppleStringsPlaceholders } from "./placeholders.js";

describe("extractAppleStringsPlaceholders", () => {
  it("extracts %@ and %d", () => {
    expect(extractAppleStringsPlaceholders("%@ has %d items")).toEqual(["%@", "%d"]);
  });

  it("extracts a positional specifier", () => {
    expect(extractAppleStringsPlaceholders("%1$@ has %2$d items")).toEqual(["%1$@", "%2$d"]);
  });

  it("extracts an escaped percent literal", () => {
    expect(extractAppleStringsPlaceholders("100%% off")).toEqual(["%%"]);
  });

  it("does not extract a percent sign followed by a space, even when a valid conversion letter follows later in the word", () => {
    expect(extractAppleStringsPlaceholders("50% off")).toEqual([]);
  });

  it("accepts a positional reorder as the same multiset", () => {
    const source = extractAppleStringsPlaceholders("%1$@ ordered %2$@");
    const reordered = extractAppleStringsPlaceholders("%2$@ was ordered by %1$@");
    expect([...source].sort()).toEqual([...reordered].sort());
  });
});
