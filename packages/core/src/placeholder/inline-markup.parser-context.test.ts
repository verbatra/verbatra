import { describe, expect, it } from "vitest";
import { compareInlineMarkup } from "./inline-markup.js";

describe("compareInlineMarkup: markup an HTML parser reads differently inside svg or math", () => {
  it.each([
    ["<math><![CDATA[x]]>", "<![CDATA[x]]><math>", "<![CDATA[...]]>"],
    ["<svg><![CDATA[x]]></svg>", "<![CDATA[x]]><svg></svg>", "<![CDATA[...]]>"],
    ["<svg><image></svg>", "<image><svg></svg>", "<image>"],
    ["<image><svg></svg>", "<svg><image></svg>", "<image>"],
    ["<svg><![CDATA[x]]>", "<![CDATA[x]]>", "<![CDATA[...]]>"],
    ["Use <math> and <image>", "Nutze <image>", "<image>"],
  ])(
    "refuses %j rewritten as %j, which moves it across the context",
    (source, translated, token) => {
      const result = compareInlineMarkup(source, translated);
      expect(result.matches).toBe(false);
      expect(result.extra).toContain(token);
    },
  );

  it.each(["<math><![CDATA[x]]>", "<svg><image></svg>", "<image><svg></svg>"])(
    "accepts %j translated as itself",
    (value) => {
      expect(compareInlineMarkup(value, value).matches).toBe(true);
    },
  );

  it("accepts a CDATA section or image word in a value that opens no such context", () => {
    expect(
      compareInlineMarkup("<![CDATA[x]]> an <image>", "ein <image> <![CDATA[x]]>").matches,
    ).toBe(true);
  });
});

describe("compareInlineMarkup: a placeholder tag left aside cannot surface from text", () => {
  const XLIFF = { ignoreTags: ["<x id/>", "<g id>"] };

  it.each([
    ['<iframe><x id="2"/>', '<x id="2"/><iframe>', "<x id/>"],
    ['<!-- <g id="1"> --></g>', '<!-- --><g id="1"></g>', "<g id>"],
    ['<textarea><x id="2"/></textarea>', '<x id="2"/><textarea></textarea>', "<x id/>"],
  ])("refuses %j rewritten as %j, which turns text into that tag", (source, translated, token) => {
    const result = compareInlineMarkup(source, translated, XLIFF);
    expect(result.matches).toBe(false);
    expect(result.extra).toContain(token);
  });

  it("still accepts a placeholder tag moved into text, which the placeholder check judges", () => {
    expect(compareInlineMarkup('<x id="2"/><iframe>', '<iframe><x id="2"/>', XLIFF).matches).toBe(
      true,
    );
  });
});
