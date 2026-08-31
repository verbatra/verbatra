import { describe, expect, it } from "vitest";
import { extractAndroidPlaceholders } from "./placeholders.js";

describe("extractAndroidPlaceholders", () => {
  it("extracts a bare %s and %d", () => {
    expect(extractAndroidPlaceholders("Hi %s, you have %d messages")).toEqual(["%s", "%d"]);
  });

  it("extracts positional specifiers", () => {
    expect(extractAndroidPlaceholders("%1$s has %2$d items")).toEqual(["%1$s", "%2$d"]);
  });

  it("treats %% as the literal-percent token", () => {
    expect(extractAndroidPlaceholders("100%% done")).toEqual(["%%"]);
  });

  it("does not extract a token from a bare percent followed by ordinary text", () => {
    expect(extractAndroidPlaceholders("50% off")).toEqual([]);
    expect(extractAndroidPlaceholders("20% faster")).toEqual([]);
  });

  it("does not treat a space as a printf flag (the java.util.Formatter space-flag trap)", () => {
    expect(extractAndroidPlaceholders("a 50 % o'clock value")).toEqual([]);
  });

  it("accepts width, precision, and length-modifier decoration on the token identity", () => {
    expect(extractAndroidPlaceholders("%05.2f")).toEqual(["%f"]);
    expect(extractAndroidPlaceholders("%1$-10s")).toEqual(["%1$s"]);
  });

  it("documents the irreducible residual case: a literal percent immediately followed by a conversion letter", () => {
    expect(extractAndroidPlaceholders("a=50%b+20%c")).toEqual(["%b", "%c"]);
  });
});
