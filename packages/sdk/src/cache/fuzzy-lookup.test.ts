import { describe, expect, it } from "vitest";
import {
  FUZZY_MAX_CANDIDATES_SCORED,
  FUZZY_MAX_SOURCE_LENGTH,
  findFuzzyMatch,
} from "./fuzzy-lookup.js";
import type { TranslationMemory } from "./types.js";

function memoryOf(
  entries: TranslationMemory["entries"],
  sources: TranslationMemory["sources"],
): TranslationMemory {
  return { version: 2, entries, sources };
}

const NEARLY = "Your subscription renews automatically at the end of each billing period.";
const EDITED = NEARLY.replace("period.", "period!");

const MEMORY = memoryOf({ fp1: { de: { h1: "Alt" } } }, { h1: NEARLY });

describe("findFuzzyMatch", () => {
  it("returns nothing when the fingerprint has no bucket for the locale", () => {
    expect(findFuzzyMatch(MEMORY, "fp1", "fr", EDITED, { threshold: 0.9 })).toBeUndefined();
  });

  it("returns nothing when the fingerprint itself is absent", () => {
    expect(findFuzzyMatch(MEMORY, "other", "de", EDITED, { threshold: 0.9 })).toBeUndefined();
  });

  it("never reaches across fingerprints, so a changed configuration stays cold", () => {
    const memory = memoryOf({ fpOld: { de: { h1: "Alt" } } }, { h1: NEARLY });

    expect(findFuzzyMatch(memory, "fpNew", "de", EDITED, { threshold: 0.9 })).toBeUndefined();
  });

  it("returns nothing for an entry carried forward with no source text on file", () => {
    const memory = memoryOf({ fp1: { de: { h1: "Alt" } } }, {});

    expect(findFuzzyMatch(memory, "fp1", "de", EDITED, { threshold: 0.9 })).toBeUndefined();
  });

  it("returns the cached translation with the score and the source it matched", () => {
    const match = findFuzzyMatch(MEMORY, "fp1", "de", EDITED, { threshold: 0.9 });

    expect(match?.value).toBe("Alt");
    expect(match?.contentHash).toBe("h1");
    expect(match?.previousSource).toBe(NEARLY);
    expect(match?.similarity).toBeGreaterThan(0.98);
  });

  it("refuses a candidate below the threshold", () => {
    const memory = memoryOf({ fp1: { de: { h1: "Alt" } } }, { h1: "Delete this account" });

    expect(
      findFuzzyMatch(memory, "fp1", "de", "Your cart is empty", { threshold: 0.9 }),
    ).toBeUndefined();
  });

  it("accepts a candidate that lands exactly on the threshold", () => {
    const memory = memoryOf({ fp1: { de: { h1: "Alt" } } }, { h1: "abcdefgh" });

    expect(findFuzzyMatch(memory, "fp1", "de", "abcd", { threshold: 0.5 })?.value).toBe("Alt");
  });

  it("picks the highest-scoring candidate, not the first one it clears the bar with", () => {
    const rival = NEARLY.replace("automatically", "auTOmaticalLX");
    const memory = memoryOf(
      { fp1: { de: { aRival: "Weit", zNear: "Nah" } } },
      { aRival: rival, zNear: EDITED },
    );

    expect(rival).toHaveLength(NEARLY.length);
    expect(findFuzzyMatch(memory, "fp1", "de", NEARLY, { threshold: 0.7 })?.value).toBe("Nah");
  });

  it("clears the bar for the rival too, so that choice is a real one", () => {
    const rival = NEARLY.replace("automatically", "auTOmaticalLX");
    const memory = memoryOf({ fp1: { de: { aRival: "Weit" } } }, { aRival: rival });

    expect(findFuzzyMatch(memory, "fp1", "de", NEARLY, { threshold: 0.7 })?.value).toBe("Weit");
  });

  it("breaks a tie on the content hash rather than on insertion order", () => {
    const sources = { bbb: "Save changes now", aaa: "Save changes now" };
    const forward = memoryOf({ fp1: { de: { aaa: "A", bbb: "B" } } }, sources);
    const reversed = memoryOf({ fp1: { de: { bbb: "B", aaa: "A" } } }, sources);
    const input = { threshold: 0.8 } as const;

    expect(findFuzzyMatch(forward, "fp1", "de", "Save changes soon", input)?.contentHash).toBe(
      "aaa",
    );
    expect(findFuzzyMatch(reversed, "fp1", "de", "Save changes soon", input)?.contentHash).toBe(
      "aaa",
    );
  });

  it("scores no more candidates than the cap, however large the bucket", () => {
    const entries: Record<string, string> = {};
    const sources: Record<string, string> = {};
    for (let index = 0; index < 5000; index += 1) {
      const hash = `h${String(index).padStart(5, "0")}`;
      entries[hash] = `Wert ${index}`;
      sources[hash] = `Save changes ${index.toString(26).padStart(5, "a")}`;
    }
    let scored = 0;
    const score = (left: string, right: string): number => {
      scored += 1;
      return left === right ? 1 : 0.95;
    };

    const match = findFuzzyMatch(
      memoryOf({ fp1: { de: entries } }, sources),
      "fp1",
      "de",
      "Save changes zzzzz",
      { threshold: 0.9, score },
    );

    expect(scored).toBeLessThanOrEqual(FUZZY_MAX_CANDIDATES_SCORED);
    expect(scored).toBeGreaterThan(0);
    expect(match).toBeDefined();
  });

  it("skips a source longer than the comparison cap without scoring anything", () => {
    const long = "a".repeat(FUZZY_MAX_SOURCE_LENGTH + 1);
    let scored = 0;
    const score = (): number => {
      scored += 1;
      return 1;
    };

    const match = findFuzzyMatch(
      memoryOf({ fp1: { de: { h1: "Alt" } } }, { h1: long }),
      "fp1",
      "de",
      long,
      { threshold: 0.9, score },
    );

    expect(match).toBeUndefined();
    expect(scored).toBe(0);
  });

  it("discards a candidate whose length alone puts the threshold out of reach", () => {
    let scored = 0;
    const score = (): number => {
      scored += 1;
      return 1;
    };

    findFuzzyMatch(
      memoryOf({ fp1: { de: { h1: "Alt" } } }, { h1: "Hi" }),
      "fp1",
      "de",
      "Your subscription renews automatically",
      { threshold: 0.9, score },
    );

    expect(scored).toBe(0);
  });
});

describe("findFuzzyMatch: the numeral guard covers every property the docs claim", () => {
  function reuse(previousSource: string, currentSource: string, threshold = 0.5): boolean {
    const memory = memoryOf({ fp1: { de: { h1: "Alt" } } }, { h1: previousSource });
    return findFuzzyMatch(memory, "fp1", "de", currentSource, { threshold }) !== undefined;
  }

  it("refuses a changed value", () => {
    expect(reuse("You have 5 unread items", "You have 6 unread items")).toBe(false);
  });

  it("refuses a changed count, even when every numeral is still present", () => {
    expect(reuse("Step 3 of the setup guide", "Step 3 of 3 the setup guide")).toBe(false);
  });

  it("refuses a changed order of the same numerals", () => {
    expect(reuse("Showing 5 of 10 results", "Showing 10 of 5 results")).toBe(false);
  });

  it("refuses two adjacent numerals merging into one", () => {
    expect(reuse("Rooms 1 2 are ready now", "Rooms 12 xx are ready now")).toBe(false);
  });

  it("refuses a changed non-ASCII decimal digit", () => {
    expect(reuse("الغرفة ٥", "الغرفة ٦")).toBe(false);
  });

  it("refuses a changed superscript, so square metres cannot become cubic metres", () => {
    expect(reuse("The floor area is 40 m² in total", "The floor area is 40 m³ in total")).toBe(
      false,
    );
  });

  it("refuses a changed vulgar fraction, so half a cup cannot become a quarter", () => {
    expect(reuse("Add ½ cup of the sauce now", "Add ¼ cup of the sauce now")).toBe(false);
  });

  it("refuses a changed Roman numeral character", () => {
    expect(reuse("Continue to chapter Ⅳ now", "Continue to chapter Ⅵ now")).toBe(false);
  });

  it("allows a source with no numerals on either side", () => {
    expect(reuse("Save your changes now", "Save your changes soon")).toBe(true);
  });

  it("allows identical numerals when only the words around them changed", () => {
    expect(reuse("Showing 5 of 10 results", "Showing 5 of 10 entries")).toBe(true);
  });
});

describe("findFuzzyMatch: identical source text is not the fuzzy layer's business", () => {
  it("refuses a candidate whose source text is identical, leaving the change to the provider", () => {
    const memory = memoryOf({ fp1: { de: { other: "Alt" } } }, { other: "Save changes" });

    expect(findFuzzyMatch(memory, "fp1", "de", "Save changes", { threshold: 0.9 })).toBeUndefined();
  });

  it("refuses a candidate that is identical only after normalization", () => {
    const memory = memoryOf({ fp1: { de: { other: "Alt" } } }, { other: "one\r\ntwo" });

    expect(findFuzzyMatch(memory, "fp1", "de", "one\ntwo", { threshold: 0.9 })).toBeUndefined();
  });

  it("refuses two empty sources, which are identical rather than a near match", () => {
    const memory = memoryOf({ fp1: { de: { h1: "Alt" } } }, { h1: "" });

    expect(findFuzzyMatch(memory, "fp1", "de", "", { threshold: 0.9 })).toBeUndefined();
  });
});

describe("findFuzzyMatch: the length prefilter measures what the score measures", () => {
  it("keeps a candidate whose raw length differs only by line endings", () => {
    const previous = "alpha\r\nbeta\r\ngamma\r\ndelta\r\nepsilon\r\nzeta\r\neta\r\ntheta";
    const current = previous.replace(/\r\n/g, "\n").replace("theta", "thetb");
    const memory = memoryOf({ fp1: { de: { h1: "Alt" } } }, { h1: previous });

    expect(previous.length / current.length).toBeGreaterThan(1.1);
    expect(findFuzzyMatch(memory, "fp1", "de", current, { threshold: 0.9 })?.value).toBe("Alt");
  });

  it("keeps a candidate whose raw length differs only by composition", () => {
    const previous = "éééé cafe menu";
    const current = `${"é".repeat(4)} cafe menus`;
    const memory = memoryOf({ fp1: { de: { h1: "Alt" } } }, { h1: previous });

    expect(previous.length / current.length).toBeGreaterThan(1.1);
    expect(findFuzzyMatch(memory, "fp1", "de", current, { threshold: 0.9 })?.value).toBe("Alt");
  });
});
