import { describe, expect, it } from "vitest";
import {
  ANDROID_PLURAL_CATEGORIES,
  androidPluralBaseKey,
  androidPluralCategoryOf,
  isAndroidPluralCategory,
  makeAndroidPluralKey,
} from "./plural.js";

describe("ANDROID_PLURAL_CATEGORIES", () => {
  it("is the six CLDR plural categories", () => {
    expect(ANDROID_PLURAL_CATEGORIES).toEqual(["zero", "one", "two", "few", "many", "other"]);
  });
});

describe("isAndroidPluralCategory", () => {
  it("accepts each CLDR category", () => {
    for (const category of ANDROID_PLURAL_CATEGORIES) {
      expect(isAndroidPluralCategory(category)).toBe(true);
    }
  });

  it("rejects a non-CLDR quantity", () => {
    expect(isAndroidPluralCategory("plural")).toBe(false);
  });
});

describe("makeAndroidPluralKey and its inverses", () => {
  it("brackets the category onto the base key", () => {
    expect(makeAndroidPluralKey("count", "one")).toBe("count[one]");
  });

  it("recovers the base key and category from a bracketed key", () => {
    expect(androidPluralBaseKey("count[one]")).toBe("count");
    expect(androidPluralCategoryOf("count[one]")).toBe("one");
  });

  it("recovers the base key when it itself contains brackets", () => {
    expect(androidPluralBaseKey("a[weird][one]")).toBe("a[weird]");
    expect(androidPluralCategoryOf("a[weird][one]")).toBe("one");
  });

  it("returns undefined for a key with no bracketed suffix", () => {
    expect(androidPluralBaseKey("plain")).toBeUndefined();
    expect(androidPluralCategoryOf("plain")).toBeUndefined();
  });

  it("returns undefined for a bracketed suffix that is not a CLDR category", () => {
    expect(androidPluralBaseKey("count[dozen]")).toBeUndefined();
    expect(androidPluralCategoryOf("count[dozen]")).toBeUndefined();
  });
});
