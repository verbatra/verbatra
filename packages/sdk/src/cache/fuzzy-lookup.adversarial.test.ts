import { similarityRatio } from "@verbatra/core";
import { describe, expect, it } from "vitest";
import {
  FUZZY_MAX_CANDIDATES_SCORED,
  FUZZY_MAX_SOURCE_LENGTH,
  findFuzzyMatch,
} from "./fuzzy-lookup.js";
import type { TranslationMemory } from "./types.js";

const DEFAULT_THRESHOLD = 0.9;

function memoryOf(previousSource: string, translation: string): TranslationMemory {
  return {
    version: 2,
    entries: { fp1: { de: { h1: translation } } },
    sources: { h1: previousSource },
  };
}

function reuse(previousSource: string, currentSource: string): string | undefined {
  const match = findFuzzyMatch(memoryOf(previousSource, "CACHED"), "fp1", "de", currentSource, {
    threshold: DEFAULT_THRESHOLD,
  });
  return match?.value;
}

describe("findFuzzyMatch: meaning-changing edits at the default threshold", () => {
  it("reuses a translation after the negation was dropped from a long sentence", () => {
    const previous = "Do not delete this file permanently from the server";
    const current = "Do delete this file permanently from the server";

    expect(similarityRatio(previous, current)).toBeGreaterThanOrEqual(DEFAULT_THRESHOLD);
    expect(reuse(previous, current)).toBe("CACHED");
  });

  it("reuses a translation after the modal was inverted", () => {
    const previous = "This action cannot be undone once confirmed";
    const current = "This action can be undone once confirmed";

    expect(reuse(previous, current)).toBe("CACHED");
  });

  it("refuses a quantity change, which no threshold could have caught", () => {
    const previous = "You have 5 items left in your shopping cart";
    const current = "You have 6 items left in your shopping cart";

    expect(similarityRatio(previous, current)).toBeGreaterThanOrEqual(DEFAULT_THRESHOLD);
    expect(reuse(previous, current)).toBeUndefined();
  });

  it("reuses a translation after the unit changed from megabytes to gigabytes", () => {
    expect(
      reuse(
        "Your upload limit is 5 MB per file attachment",
        "Your upload limit is 5 GB per file attachment",
      ),
    ).toBe("CACHED");
  });

  it("reuses a translation after the proper noun changed", () => {
    expect(
      reuse(
        "Sign in with your Google account to continue",
        "Sign in with your Apple account to continue",
      ),
    ).toBe("CACHED");
  });

  it("reuses a translation after a singular subject became plural", () => {
    expect(
      reuse(
        "Delete the selected file from this folder",
        "Delete the selected files from this folder",
      ),
    ).toBe("CACHED");
  });

  it("reuses a translation after a statement became a question", () => {
    expect(reuse("Are you sure you want to continue", "Are you sure you want to continue?")).toBe(
      "CACHED",
    );
  });

  it("reuses a translation after only the leading capital changed", () => {
    expect(
      reuse("save changes before leaving the page", "Save changes before leaving the page"),
    ).toBe("CACHED");
  });

  it("refuses the same quantity change once the sentence is short enough to score low", () => {
    expect(reuse("5 items", "6 items")).toBeUndefined();
  });

  it("refuses a wholesale case change, since every letter counts as an edit", () => {
    expect(reuse("delete account", "DELETE ACCOUNT")).toBeUndefined();
  });

  it("refuses a single digit change that clears even a 0.98 threshold", () => {
    const previous = `Retry the upload after ${"a".repeat(56)} 5`;
    const current = previous.replace(/5$/, "6");
    const match = findFuzzyMatch(memoryOf(previous, "CACHED"), "fp1", "de", current, {
      threshold: 0.98,
    });

    expect(similarityRatio(previous, current)).toBeGreaterThan(0.98);
    expect(match).toBeUndefined();
  });

  it("refuses a reuse when a number appeared in a source that had none", () => {
    const previous =
      "Your upload limit is five MB per file attachment and cannot be raised on this plan";
    const current =
      "Your upload limit is 5 MB per file attachment and cannot be raised on this plan";

    expect(similarityRatio(previous, current)).toBeGreaterThanOrEqual(DEFAULT_THRESHOLD);
    expect(reuse(previous, current)).toBeUndefined();
  });

  it("reuses when the digits are untouched and only the wording around them moved", () => {
    expect(
      reuse(
        "You have 5 items left in your shopping cart",
        "You have 5 items left in your shopping carts",
      ),
    ).toBe("CACHED");
  });
});

describe("findFuzzyMatch: boundaries", () => {
  it("reuses a candidate that lands exactly on the default threshold", () => {
    expect(reuse("abcdefghij", "abcdefghiX")).toBe("CACHED");
  });

  it("refuses the same shape one edit further away", () => {
    expect(reuse("abcdefghijklmnopqrs", "abcdefghijklmnopqXY")).toBeUndefined();
  });

  it("refuses an empty current source against non-empty cached text", () => {
    expect(reuse("Save changes", "")).toBeUndefined();
  });

  it("refuses an empty cached source against non-empty current text", () => {
    expect(reuse("", "Save changes")).toBeUndefined();
  });

  it("accepts a cached source of exactly the comparison cap", () => {
    const capped = "a".repeat(FUZZY_MAX_SOURCE_LENGTH);
    const edited = `${"a".repeat(FUZZY_MAX_SOURCE_LENGTH - 1)}b`;

    expect(capped).toHaveLength(FUZZY_MAX_SOURCE_LENGTH);
    expect(reuse(capped, edited)).toBe("CACHED");
  });

  it("refuses a cached source one character over the comparison cap", () => {
    const over = "a".repeat(FUZZY_MAX_SOURCE_LENGTH + 1);
    const edited = `${"a".repeat(FUZZY_MAX_SOURCE_LENGTH)}b`;

    expect(reuse(over, edited)).toBeUndefined();
  });

  it("accepts a current source of exactly the comparison cap", () => {
    const capped = `${"a".repeat(FUZZY_MAX_SOURCE_LENGTH - 1)}b`;
    const cached = "a".repeat(FUZZY_MAX_SOURCE_LENGTH);

    expect(capped).toHaveLength(FUZZY_MAX_SOURCE_LENGTH);
    expect(reuse(cached, capped)).toBe("CACHED");
  });

  it("refuses a current source one character over the comparison cap without consulting the bucket", () => {
    const over = `${"a".repeat(FUZZY_MAX_SOURCE_LENGTH)}b`;
    let scored = 0;
    const score = (): number => {
      scored += 1;
      return 1;
    };

    expect(
      findFuzzyMatch(memoryOf("a".repeat(10), "CACHED"), "fp1", "de", over, {
        threshold: DEFAULT_THRESHOLD,
        score,
      }),
    ).toBeUndefined();
    expect(scored).toBe(0);
  });
});

describe("findFuzzyMatch: ordering among equally good candidates", () => {
  const TIED: TranslationMemory = {
    version: 2,
    entries: { fp1: { de: { aaa: "A", bbb: "B" } } },
    sources: { aaa: "Save changes now", bbb: "Save changes now" },
  };

  it("settles a tie on the content hash, and does so in both insertion orders", () => {
    const reversed: TranslationMemory = {
      version: 2,
      entries: { fp1: { de: { bbb: "B", aaa: "A" } } },
      sources: TIED.sources,
    };

    for (const memory of [TIED, reversed]) {
      expect(
        findFuzzyMatch(memory, "fp1", "de", "Save changes soon", { threshold: 0.8 })?.contentHash,
      ).toBe("aaa");
    }
  });

  it("returns the same winner on repeated calls over a bucket rebuilt in reverse", () => {
    const winners = new Set<string>();
    for (let run = 0; run < 25; run += 1) {
      const entries: Record<string, string> = {};
      const order = run % 2 === 0 ? ["aaa", "bbb"] : ["bbb", "aaa"];
      for (const hash of order) {
        entries[hash] = hash === "aaa" ? "A" : "B";
      }
      const memory: TranslationMemory = {
        version: 2,
        entries: { fp1: { de: entries } },
        sources: TIED.sources,
      };
      const match = findFuzzyMatch(memory, "fp1", "de", "Save changes soon", { threshold: 0.8 });
      winners.add(match?.contentHash ?? "none");
    }

    expect([...winners]).toEqual(["aaa"]);
  });

  it("lets the length ceiling outrank the content hash when scores are equal", () => {
    const memory: TranslationMemory = {
      version: 2,
      entries: { fp1: { de: { aaa: "SHORTER", zzz: "SAME LENGTH" } } },
      sources: { aaa: "Save chang", zzz: "Save changes now" },
    };

    const match = findFuzzyMatch(memory, "fp1", "de", "Save changes soon", {
      threshold: 0.5,
      score: () => 0.95,
    });

    expect(match?.contentHash).toBe("zzz");
  });

  it("refuses a textually identical source wherever it sorts, leaving it to the provider", () => {
    const query = "Save changes in the editor pane right now please";
    const entries: Record<string, string> = { zPerfect: "EXACT" };
    const sources: Record<string, string> = { zPerfect: query };
    const memory: TranslationMemory = { version: 2, entries: { fp1: { de: entries } }, sources };

    expect(similarityRatio(sources.zPerfect as string, query)).toBe(1);
    expect(
      findFuzzyMatch(memory, "fp1", "de", query, { threshold: DEFAULT_THRESHOLD }),
    ).toBeUndefined();
  });

  it("still lets the scoring cap drop a merely better candidate, which stays a known bound", () => {
    const query = `Save changes in the editor pane right now ${"b".repeat(8)}`;
    const entries: Record<string, string> = { zNearest: "NEAREST" };
    const sources: Record<string, string> = {
      zNearest: `Save changes in the editor pane right now ${"b".repeat(7)}c`,
    };
    for (let index = 0; index < FUZZY_MAX_CANDIDATES_SCORED + 10; index += 1) {
      const hash = `a${String(index).padStart(5, "0")}`;
      entries[hash] = `APPROX ${index}`;
      sources[hash] = `Save changes in the editor pane right now ${"d".repeat(8)}`;
    }
    const memory: TranslationMemory = { version: 2, entries: { fp1: { de: entries } }, sources };

    const match = findFuzzyMatch(memory, "fp1", "de", query, { threshold: DEFAULT_THRESHOLD });

    expect(similarityRatio(sources.zNearest as string, query)).toBeGreaterThan(
      similarityRatio(sources.a00000 as string, query),
    );
    expect(match?.contentHash).not.toBe("zNearest");
  });
});
