import { describe, expect, it } from "vitest";
import { caseInsensitiveRepeats, didYouMeanHint } from "./case-insensitive.js";

describe("didYouMeanHint", () => {
  it("names the candidate that matches ignoring case", () => {
    expect(didYouMeanHint("JA", ["de", "ja"])).toBe('; did you mean "ja"?');
  });

  it("is empty when no candidate matches ignoring case", () => {
    expect(didYouMeanHint("fr", ["de", "ja"])).toBe("");
  });
});

describe("caseInsensitiveRepeats", () => {
  it("lists each later spelling of a value already seen ignoring case, in order", () => {
    expect(caseInsensitiveRepeats(["ja", "de", "JA", "De", "ja"])).toEqual(["JA", "De", "ja"]);
  });

  it("is empty when every value is distinct ignoring case", () => {
    expect(caseInsensitiveRepeats(["ja", "de"])).toEqual([]);
  });
});
