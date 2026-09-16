import { describe, expect, it } from "vitest";
import { compareInlineMarkup } from "./inline-markup.js";

describe("compareInlineMarkup: the content of a raw text element is text, as an HTML parser reads it", () => {
  it.each([
    ["Add a <script> tag", 'Füge ein <script><b x="</script><img src=x onerror=alert(1)>'],
    ["Set the <title> field", 'Setze <title><i y="</title><img src=x onerror=alert(1)>'],
    ["Edit the <textarea> box", '<textarea><u v="</textarea><img src=x onerror=alert(1)>'],
    ["Use <style> blocks", '<style><q r="</style><svg onload=alert(1)>'],
    ["Use <xmp>", "<xmp><a b='</xmp><img src=x onerror=alert(1)>"],
    ["Use <iframe>", "<iframe><a b='</iframe><img src=x onerror=alert(1)>"],
    ["Use <noscript>", "<noscript><a b='</noscript><img src=x onerror=alert(1)>"],
    ["Use <noembed>", "<noembed><a b='</noembed><img src=x onerror=alert(1)>"],
    ["Use <noframes>", "<noframes><a b='</noframes><img src=x onerror=alert(1)>"],
  ])("refuses markup smuggled past the end of %j", (source, translated) => {
    expect(compareInlineMarkup(source, translated).matches).toBe(false);
  });

  it("names the tag that follows the raw text element's end", () => {
    const result = compareInlineMarkup(
      "Add a <script> tag",
      'Füge ein <script><b x="</script><img src=x onerror=alert(1)>',
    );
    expect(result.extra).toContain("<img onerror src>");
  });

  it("refuses a tag smuggled past a raw text element the source carries as a closed pair", () => {
    expect(
      compareInlineMarkup(
        '<b title="t">Add</b> a <script></script> tag',
        '<script><b title="</script><img src=x onerror=alert(1)>">x</b>',
      ).matches,
    ).toBe(false);
  });

  it("accepts a translation that keeps a raw text element named as a word", () => {
    expect(compareInlineMarkup("Add a <script> tag", "Füge ein <script>-Tag hinzu").matches).toBe(
      true,
    );
  });

  it("reads tags written inside a raw text element as its text, on both sides", () => {
    expect(
      compareInlineMarkup("<textarea><b>bold</b></textarea>", "<textarea><i>fett</i></textarea>")
        .matches,
    ).toBe(true);
  });

  it("ends a raw text element at its closing tag in any case spelling and resumes the scan", () => {
    const result = compareInlineMarkup("<title>a</title>", "<title>a</TITLE >b<img src=x>");
    expect(result.matches).toBe(false);
    expect(result.extra).toContain("<img src>");
  });

  it("does not end a raw text element at a closing tag name that merely starts the same way", () => {
    expect(
      compareInlineMarkup("<title>a</title>", "<title>a</titles><img src=x></title>").matches,
    ).toBe(true);
  });

  it("does not end a raw text element at a bare closing tag name at the end of the value", () => {
    expect(compareInlineMarkup("<title>a</title>", "<title>a</title").matches).toBe(false);
  });

  it("enters raw text after a self-closing spelling too, which an HTML parser ignores", () => {
    expect(
      compareInlineMarkup("<textarea/> box", '<textarea/><b x="</textarea><img src=x onerror=1>')
        .matches,
    ).toBe(false);
  });

  it("reads everything after a plaintext element as text, past any closing tag", () => {
    expect(
      compareInlineMarkup("Use <plaintext>", "<plaintext></plaintext><img src=x onerror=1>")
        .matches,
    ).toBe(true);
  });
});

describe("compareInlineMarkup: raw text an HTML parser can read two ways is refused unless unchanged", () => {
  it.each([
    [
      "a script whose content opens an escape",
      "<script></script> and <b x='1'>bold</b>",
      '<script><!--<script></script><b x="--></script><img src=x onerror=1>"></b>',
      "<script>...</script>",
    ],
    [
      "a noscript element whose content carries markup",
      "Use <noscript> with <b>bold</b>",
      "<noscript><b>fett</b></noscript>",
      "<noscript>...</noscript>",
    ],
    [
      "a style element inside svg, where it is not raw text",
      "<svg></svg><style></style><b x='1'>b</b>",
      '<svg><style><b x="</style><img src=x onerror=1>"></b></style></svg>',
      "<style>...</style>",
    ],
    [
      "a raw text element after math",
      "<math></math><title></title>",
      "<math><title><b></b></title></math>",
      "<title>...</title>",
    ],
    [
      "a raw text element after select",
      "<select></select> <style>",
      "<select><style><input onfocus=alert(1) autofocus>",
      "<style>...</style>",
    ],
    [
      "a CDATA section after svg",
      "<svg><![CDATA[x]]></svg> <b x='1'>b</b>",
      '<svg><![CDATA[><b x="]]><img src=x onerror=1>"></b></svg>',
      "<![CDATA[...]]>",
    ],
  ])("refuses %s", (_label, source, translated, reading) => {
    const result = compareInlineMarkup(source, translated);
    expect(result.matches).toBe(false);
    expect(result.extra).toContain(reading);
  });

  it.each([
    "<script><!--<script></script>--></script>",
    "Use <noscript><b>bold</b></noscript>",
    "<svg><style><b>x</b></style></svg>",
    "<svg><![CDATA[x]]></svg>",
    "<select><textarea><b>x</b></textarea></select>",
  ])("accepts %j translated as itself", (value) => {
    expect(compareInlineMarkup(value, value).matches).toBe(true);
  });

  it.each([
    ["Use <noscript>Enable scripts</noscript>", "<noscript>Aktiviere Skripte</noscript>"],
    ["<svg></svg><style>a{}</style>", "<style>b{}</style><svg></svg>"],
    ["<script>a()</script>", "<script>b()</script>"],
  ])("accepts %j translated with content that holds no markup", (source, translated) => {
    expect(compareInlineMarkup(source, translated).matches).toBe(true);
  });
});

describe("compareInlineMarkup: a tag the candidate never finishes", () => {
  it.each(["Hallo <a title='never closed", "Hallo <a", '<b>x</b> <img src="x'])(
    "refuses %j against a source that finishes every tag",
    (translated) => {
      const result = compareInlineMarkup("Hello <b>x</b>", translated);
      expect(result.matches).toBe(false);
      expect(result.extra.some((token) => token.startsWith("<") && !token.endsWith(">"))).toBe(
        true,
      );
    },
  );

  it("accepts an unfinished tag the source leaves unfinished too", () => {
    expect(compareInlineMarkup("Compare with <b", "Vergleiche mit <b").matches).toBe(true);
  });
});
