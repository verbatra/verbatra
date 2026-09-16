import { describe, expect, it } from "vitest";
import { compareInlineMarkup } from "./inline-markup.js";

describe("compareInlineMarkup: a closing bracket run that is not an end tag, as an HTML tokenizer reads it", () => {
  it.each([
    ["Hallo </1 x>", "</1 x>"],
    ["Hallo </0 x>", "</0 x>"],
    ["Hallo </0/>", "</0/>"],
    ["Hallo </@>", "</@>"],
    ["Hallo </1 x><img src=x onerror=alert(1)>", "</1 x>"],
  ])("reads %j as a bogus comment and refuses it", (translated, construct) => {
    const result = compareInlineMarkup("Hello", translated);
    expect(result.matches).toBe(false);
    expect(result.extra).toContain(construct);
  });

  it("ends the bogus comment at its first closing bracket, so a tag after it is still compared", () => {
    expect(compareInlineMarkup("Hello", "Hallo </1 x><b>x</b>").extra).toEqual([
      "</1 x>",
      "</b>",
      "<b>",
    ]);
  });

  it("ignores an empty end tag, which an HTML tokenizer drops", () => {
    expect(compareInlineMarkup("Hello", "Hallo </>")).toEqual({
      matches: true,
      missing: [],
      extra: [],
      malformed: false,
    });
  });

  it("still reads a numeric rich-text closing tag as a tag, so its count must match", () => {
    expect(compareInlineMarkup("Hello", "Hallo </0>").extra).toEqual(["</0>"]);
    expect(compareInlineMarkup("<0>a</0>", "<0>a</0 >").matches).toBe(true);
  });

  it.each(["Press </1 x> now", "a </0/> b", "Hi </> there"])(
    "accepts %j translated as itself",
    (value) => {
      expect(compareInlineMarkup(value, value).matches).toBe(true);
    },
  );
});
