import { describe, expect, it } from "vitest";
import { entry } from "../test-support.js";
import { PLACEHOLDER_UNSUPPORTED_MESSAGE, partitionByPlaceholders } from "./placeholders.js";

describe("partitionByPlaceholders", () => {
  it("splits placeholder-free (protectable) from placeholder-bearing (unprotectable)", () => {
    const free = entry("a", "Hello");
    const bearing = entry("b", "Hello {{name}}", ["{{name}}"]);
    const { protectable, unprotectable } = partitionByPlaceholders([free, bearing]);
    expect(protectable).toEqual([free]);
    expect(unprotectable).toEqual([bearing]);
  });

  it("treats any entry with at least one placeholder as unprotectable", () => {
    const icu = entry("c", "{count, plural, one {# item} other {# items}}", ["count"]);
    const { protectable, unprotectable } = partitionByPlaceholders([icu]);
    expect(protectable).toEqual([]);
    expect(unprotectable).toEqual([icu]);
  });

  it("returns empty partitions for an empty batch", () => {
    const { protectable, unprotectable } = partitionByPlaceholders([]);
    expect(protectable).toEqual([]);
    expect(unprotectable).toEqual([]);
  });

  it("puts every entry in protectable when none carry placeholders", () => {
    const entries = [entry("a", "A"), entry("b", "B")];
    const { protectable, unprotectable } = partitionByPlaceholders(entries);
    expect(protectable).toEqual(entries);
    expect(unprotectable).toEqual([]);
  });

  it("preserves relative order so protectable is an order-preserving subsequence", () => {
    const first = entry("first", "one");
    const skip = entry("skip", "has {{x}}", ["{{x}}"]);
    const second = entry("second", "two");
    const third = entry("third", "three");
    const { protectable, unprotectable } = partitionByPlaceholders([first, skip, second, third]);
    expect(protectable.map((e) => e.key)).toEqual(["first", "second", "third"]);
    expect(unprotectable.map((e) => e.key)).toEqual(["skip"]);
  });

  it("exposes a static, secret-free message that names no key or content", () => {
    expect(PLACEHOLDER_UNSUPPORTED_MESSAGE).toContain("Google Cloud Translation");
    expect(PLACEHOLDER_UNSUPPORTED_MESSAGE).toContain("LLM provider");
    expect(PLACEHOLDER_UNSUPPORTED_MESSAGE).not.toContain("{{");
    expect(PLACEHOLDER_UNSUPPORTED_MESSAGE).not.toContain("AIza");
  });
});
