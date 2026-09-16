import { describe, expect, it } from "vitest";
import { compareInlineMarkup } from "./inline-markup.js";

describe("compareInlineMarkup: the content of a script-like raw text element is carried unchanged", () => {
  it.each([
    ["Add a <script> tag", "Füge ein <script> Tag", "<script> content"],
    ["Add a <script> tag", "<script>alert(1)", "<script> content"],
    ["<style>a{}</style> b", "<style>body{background:url(//x)}</style> b", "<style> content"],
    ["<iframe>x</iframe>", "<iframe>y</iframe>", "<iframe> content"],
    ["<noembed>x</noembed>", "<noembed>y</noembed>", "<noembed> content"],
    ["<noframes>x</noframes>", "<noframes>y</noframes>", "<noframes> content"],
    [
      "Use <noscript>Enable scripts</noscript>",
      "<noscript>Aktiviere Skripte</noscript>",
      "<noscript> content",
    ],
    ["<xmp>a</xmp>", "<xmp>b</xmp>", "<xmp> content"],
    ["Use <plaintext> here", "Nutze <plaintext> hier", "<plaintext> content"],
  ])("refuses %j rewritten as %j", (source, translated, detail) => {
    const result = compareInlineMarkup(source, translated);
    expect(result.matches).toBe(false);
    expect(result.extra).toContain(detail);
  });

  it.each([
    ["<math><style>a{}</style>", "<style>a{}</style>", "<style> content"],
    ["<svg><script>x</script></svg>", "<script>x</script><svg></svg>", "<script> content"],
  ])(
    "refuses %j rewritten as %j, which moves unchanged content out of svg or math",
    (source, translated, detail) => {
      expect(compareInlineMarkup(source, translated).extra).toContain(detail);
    },
  );

  it("refuses unchanged content after svg or math when the value around it changed", () => {
    expect(
      compareInlineMarkup("<br><math><style>&lt;b&gt;", "<math><br><style>&lt;b&gt;").extra,
    ).toContain("<style> content");
  });

  it("matches contents in order per element name, so swapping two scripts is refused", () => {
    expect(
      compareInlineMarkup(
        "<script>a()</script> <script>b()</script>",
        "<script>b()</script> <script>a()</script>",
      ).extra,
    ).toEqual(["<script> content", "<script> content"]);
  });

  it.each([
    "Add a <script> tag",
    "<style>a{}</style> and <script>b()</script>",
    "Use <plaintext> here",
  ])("accepts %j translated as itself", (value) => {
    expect(compareInlineMarkup(value, value).matches).toBe(true);
  });

  it("accepts the text around an unchanged script element being translated", () => {
    expect(
      compareInlineMarkup("Run <script>a()</script> now", "Führe <script>a()</script> jetzt aus")
        .matches,
    ).toBe(true);
  });

  it.each([
    ["<title>Hello</title>", "<title>Hallo</title>"],
    ["<textarea>Type here</textarea>", "<textarea>Hier tippen</textarea>"],
  ])("accepts %j with its rendered-as-text content translated", (source, translated) => {
    expect(compareInlineMarkup(source, translated).matches).toBe(true);
  });
});
