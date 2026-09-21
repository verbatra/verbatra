import { describe, expect, it } from "vitest";
import { compareInlineMarkup } from "./inline-markup.js";

const XLIFF = { ignoreTags: ["<g id>"] };

describe("compareInlineMarkup: ignored placeholder tags still nest with the compared tags", () => {
  it("refuses a compared tag that now crosses an ignored one", () => {
    expect(compareInlineMarkup('<g id="1"><b>x</b></g>', '<g id="1"><b>x</g></b>', XLIFF)).toEqual({
      matches: false,
      missing: [],
      extra: [],
      malformed: true,
    });
  });

  it("refuses an ignored tag that now closes inside a compared one", () => {
    expect(
      compareInlineMarkup('<b><g id="1">x</g></b> y', '<g id="1"><b>x</g> y</b>', XLIFF).malformed,
    ).toBe(true);
  });

  it("accepts the compared and ignored tags nested another valid way", () => {
    expect(
      compareInlineMarkup('<g id="1"><b>x</b></g> y', '<b><g id="1">x</g></b> y', XLIFF).matches,
    ).toBe(true);
  });

  it("does not demand a nesting the source itself never had", () => {
    expect(
      compareInlineMarkup('<g id="1"><b>x</g></b>', '<g id="1"><b>y</g></b>', XLIFF).matches,
    ).toBe(true);
  });
});
