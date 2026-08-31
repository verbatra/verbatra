import { checkPlaceholders } from "@verbatra/core";
import { describe, expect, it } from "vitest";
import { extractGettextPlaceholders } from "./placeholders.js";

describe("extractGettextPlaceholders", () => {
  it("extracts a bare %s conversion", () => {
    expect(extractGettextPlaceholders("Hello, %s!")).toEqual(["%s"]);
  });

  it("extracts a positional %1$s conversion", () => {
    expect(extractGettextPlaceholders("%2$s gave %1$s a gift")).toEqual(["%2$s", "%1$s"]);
  });

  it("extracts a Python-style named %(name)s conversion", () => {
    expect(extractGettextPlaceholders("Hello, %(name)s!")).toEqual(["%(name)s"]);
  });

  it("extracts a numeric conversion with width and precision", () => {
    expect(extractGettextPlaceholders("Total: %.2f")).toEqual(["%f"]);
  });

  it("extracts an escaped literal %% as its own token", () => {
    expect(extractGettextPlaceholders("100%% done")).toEqual(["%%"]);
  });

  it("extracts every occurrence of a repeated placeholder in document order", () => {
    expect(extractGettextPlaceholders("%s of %s")).toEqual(["%s", "%s"]);
  });

  it("extracts nothing from ordinary text with no percent sign", () => {
    expect(extractGettextPlaceholders("no placeholders here")).toEqual([]);
  });

  it("is multiset-aware end to end: dropping a repeated occurrence is a mismatch", () => {
    const source = extractGettextPlaceholders("%s of %s");
    const translated = extractGettextPlaceholders("%s total");
    const result = checkPlaceholders(source, translated);
    expect(result.matches).toBe(false);
    expect(result.missing).toEqual(["%s"]);
  });

  it("treats a reordered positional-plus-named pair as a match", () => {
    const source = extractGettextPlaceholders("%(count)d items for %(user)s");
    const translated = extractGettextPlaceholders("%(user)s has %(count)d items");
    const result = checkPlaceholders(source, translated);
    expect(result.matches).toBe(true);
    expect(result.reordered).toBe(true);
  });
});
