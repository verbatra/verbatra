import { describe, expect, it } from "vitest";
import { contentHash } from "../hash/content-hash.js";
import { entry, resource } from "../testing/factories.js";
import { diffResources, isBlankValue } from "./diff-resources.js";

describe("diffResources", () => {
  it("handles two empty resources", () => {
    const result = diffResources(resource("en", []), resource("de", []));
    expect(result).toEqual({
      missing: [],
      changed: [],
      orphaned: [],
      unchanged: [],
      emptySource: [],
    });
  });

  it("reports identical resources as fully unchanged", () => {
    const source = resource("en", [entry({ key: "a" }), entry({ key: "b" })]);
    const target = resource("de", [entry({ key: "a" }), entry({ key: "b" })]);
    const result = diffResources(source, target);
    expect(result.unchanged).toEqual(["a", "b"]);
    expect(result.missing).toEqual([]);
    expect(result.changed).toEqual([]);
    expect(result.orphaned).toEqual([]);
  });

  it("reports a source-only key as missing", () => {
    const source = resource("en", [entry({ key: "a" }), entry({ key: "b" })]);
    const target = resource("de", [entry({ key: "a" })]);
    expect(diffResources(source, target).missing).toEqual(["b"]);
  });

  it("reports a target-only key as orphaned", () => {
    const source = resource("en", [entry({ key: "a" })]);
    const target = resource("de", [entry({ key: "a" }), entry({ key: "old" })]);
    expect(diffResources(source, target).orphaned).toEqual(["old"]);
  });

  it("reports a changed source key as stale when a baseline is given", () => {
    const original = entry({ key: "a", value: "v1" });
    const changed = entry({ key: "a", value: "v2" });
    const source = resource("en", [changed]);
    const target = resource("de", [entry({ key: "a" })]);
    const baseline = new Map([["a", contentHash(original)]]);
    const result = diffResources(source, target, { baseline });
    expect(result.changed).toEqual(["a"]);
    expect(result.unchanged).toEqual([]);
  });

  it("reports a placeholder-only change as stale even when value is unchanged", () => {
    const original = entry({ key: "a", value: "v1", placeholders: ["{x}"] });
    const changed = entry({ key: "a", value: "v1", placeholders: ["{y}"] });
    const source = resource("en", [changed]);
    const target = resource("de", [entry({ key: "a" })]);
    const baseline = new Map([["a", contentHash(original)]]);
    const result = diffResources(source, target, { baseline });
    expect(result.changed).toEqual(["a"]);
    expect(result.unchanged).toEqual([]);
  });

  it("treats a baseline-matching key as unchanged", () => {
    const e = entry({ key: "a", value: "v1" });
    const source = resource("en", [e]);
    const target = resource("de", [entry({ key: "a" })]);
    const baseline = new Map([["a", contentHash(e)]]);
    expect(diffResources(source, target, { baseline }).unchanged).toEqual(["a"]);
  });

  it("cannot detect change without a baseline (shared keys are unchanged)", () => {
    const source = resource("en", [entry({ key: "a", value: "v2" })]);
    const target = resource("de", [entry({ key: "a" })]);
    const result = diffResources(source, target);
    expect(result.changed).toEqual([]);
    expect(result.unchanged).toEqual(["a"]);
  });

  it("handles plural keys like any other entry", () => {
    const source = resource("en", [entry({ key: "items", isPlural: true })]);
    const target = resource("de", []);
    expect(diffResources(source, target).missing).toEqual(["items"]);
  });

  it("does not mutate its inputs", () => {
    const source = resource("en", [entry({ key: "a" })]);
    const target = resource("de", [entry({ key: "b" })]);
    diffResources(source, target);
    expect([...source.entries.keys()]).toEqual(["a"]);
    expect([...target.entries.keys()]).toEqual(["b"]);
  });

  it("returns sorted, deterministic output", () => {
    const source = resource("en", [entry({ key: "c" }), entry({ key: "a" }), entry({ key: "b" })]);
    const target = resource("de", []);
    expect(diffResources(source, target).missing).toEqual(["a", "b", "c"]);
  });

  it("files a source-only key with an empty or whitespace-only value as emptySource, not missing", () => {
    const source = resource("en", [
      entry({ key: "a", value: "" }),
      entry({ key: "b", value: " \t\n" }),
      entry({ key: "c", value: "text" }),
    ]);
    const result = diffResources(source, resource("de", []));
    expect(result.missing).toEqual(["c"]);
    expect(result.emptySource).toEqual(["a", "b"]);
  });

  it("files a source blanked since the baseline as emptySource, not changed", () => {
    const original = entry({ key: "a", value: "Hello" });
    const blanked = entry({ key: "a", value: "" });
    const baseline = new Map([["a", contentHash(original)]]);
    const result = diffResources(resource("en", [blanked]), resource("de", [entry({ key: "a" })]), {
      baseline,
    });
    expect(result.changed).toEqual([]);
    expect(result.unchanged).toEqual([]);
    expect(result.emptySource).toEqual(["a"]);
  });

  it("keeps a blank source key that the target holds and the baseline matches as unchanged", () => {
    const blank = entry({ key: "a", value: "" });
    const baseline = new Map([["a", contentHash(blank)]]);
    const result = diffResources(resource("en", [blank]), resource("de", [entry({ key: "a" })]), {
      baseline,
    });
    expect(result.unchanged).toEqual(["a"]);
    expect(result.emptySource).toEqual([]);
  });

  it("never counts a blank source key as orphaned", () => {
    const result = diffResources(
      resource("en", [entry({ key: "a", value: "" })]),
      resource("de", [entry({ key: "a" }), entry({ key: "gone" })]),
    );
    expect(result.orphaned).toEqual(["gone"]);
  });

  it("treats only an empty or whitespace-only value as blank", () => {
    expect(isBlankValue("")).toBe(true);
    expect(isBlankValue("\u00a0 ")).toBe(true);
    expect(isBlankValue(" x ")).toBe(false);
  });
});
