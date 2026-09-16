import { describe, expect, it } from "vitest";
import { compareInlineMarkup } from "./inline-markup.js";

describe("compareInlineMarkup: a bracketed word an HTML parser turns into a real element", () => {
  it.each([
    ["Hallo <image>", "<image>"],
    ["Hallo <IMAGE>", "<IMAGE>"],
    ["Hallo <my-widget>", "<my-widget>"],
    ["Hallo <x-key>", "<x-key>"],
    ["Hallo <Foo-Bar_1>", "<Foo-Bar_1>"],
  ])("refuses %j added to a source with no markup", (translated, word) => {
    expect(compareInlineMarkup("Hello", translated)).toEqual({
      matches: false,
      missing: [],
      extra: [word],
      malformed: false,
    });
  });

  it.each([
    ["Draw an <image>", "Zeichne ein <image>"],
    ["Use <my-widget> here", "Nutze <my-widget> hier"],
  ])("accepts %j once the source carries the word", (source, translated) => {
    expect(compareInlineMarkup(source, translated).matches).toBe(true);
  });

  it("still reads a word with no hyphen that is not an element name as prose", () => {
    expect(compareInlineMarkup("Hello", "Drücke <Enter_1>").matches).toBe(true);
  });
});
