import { describe, expect, it } from "vitest";
import { compareInlineMarkup } from "./inline-markup.js";

describe("compareInlineMarkup: a source whose tags are not well formed is still compared", () => {
  it.each([
    ["if a<b and c>d", "wenn a<b and c>d <img src=x onerror=alert(1)>", "<img onerror src>"],
    ["Hello</b>", "Hallo</b><img src=x onerror=alert(1)>", "<img onerror src>"],
    [
      'Click <a href="/x">here',
      'Klick <a href="/x">hier<img src=x onerror=alert(1)>',
      "<img onerror src>",
    ],
    ["<b><i>x</b></i>", "<b><i>x</b></i><script>alert(1)</script>", "<script>"],
  ])("refuses a tag invented beside the markup of %j", (source, translated, invented) => {
    const result = compareInlineMarkup(source, translated);
    expect(result.matches).toBe(false);
    expect(result.extra).toContain(invented);
  });

  it.each(["if a<b and c>d", "Hello</b>", 'Click <a href="/x">here', "<b><i>x</b></i>"])(
    "accepts %j translated as itself",
    (value) => {
      expect(compareInlineMarkup(value, value).matches).toBe(true);
    },
  );

  it("accepts prose that keeps the bracketed run exactly", () => {
    expect(compareInlineMarkup("Use a<b and c>d", "Verwende a<b and c>d").matches).toBe(true);
  });

  it("refuses prose whose bracketed run changed a word an HTML parser reads as an attribute", () => {
    expect(compareInlineMarkup("Use a<b and c>d", "Verwende a<b und c>d")).toEqual({
      matches: false,
      missing: ["<b and c>"],
      extra: ["<b c und>"],
      malformed: false,
    });
  });

  it("refuses a tag the translation dropped", () => {
    expect(compareInlineMarkup("<b>a<i>b</b></i>", "voellig anders")).toEqual({
      matches: false,
      missing: ["</b>", "</i>", "<b>", "<i>"],
      extra: [],
      malformed: false,
    });
  });

  it("accepts the same tags in a different order, since the source never nested them", () => {
    expect(compareInlineMarkup("Hello</b> world", "Hallo Welt</b>").matches).toBe(true);
  });
});
