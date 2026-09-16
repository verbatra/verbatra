import { describe, expect, it } from "vitest";
import { compareInlineMarkup, inlineTagToken } from "./inline-markup.js";

describe("compareInlineMarkup: prose that merely contains an angle bracket is never markup", () => {
  it.each([
    ["5 < 10", "10 > 5"],
    ["a < b and b > c", "a < b und b > c"],
    ["I <3 this", "Ich <3 das"],
    ["Write x <= y", "Schreibe x <= y"],
    ["Mail us at <support@example.com>", "Schreib an <support@example.com>"],
    ["Press <Enter> to continue", "Weiter mit der Eingabetaste"],
    ["a < b < c", "c > b > a"],
    ["< 5 minutes", "weniger als 5 Minuten"],
  ])("leaves %j alone", (source, translated) => {
    expect(compareInlineMarkup(source, translated)).toEqual({
      matches: true,
      missing: [],
      extra: [],
      malformed: false,
    });
  });

  it("treats an unterminated angle bracket run at the end of a value as text", () => {
    expect(compareInlineMarkup("Compare with <b", "Vergleiche mit <b").matches).toBe(true);
  });

  it("treats entity-escaped brackets as text, not as a tag", () => {
    expect(compareInlineMarkup("&lt;b&gt;bold&lt;/b&gt;", "&lt;b&gt;fett&lt;/b&gt;")).toEqual({
      matches: true,
      missing: [],
      extra: [],
      malformed: false,
    });
  });

  it("reports nothing when a value escapes only one side of a pair", () => {
    expect(compareInlineMarkup("&lt;b&gt;bold", "&lt;b&gt;fett").matches).toBe(true);
  });
});

describe("compareInlineMarkup: a value with no markup on either side", () => {
  it("matches", () => {
    expect(compareInlineMarkup("Save changes", "Anderungen speichern")).toEqual({
      matches: true,
      missing: [],
      extra: [],
      malformed: false,
    });
  });

  it("matches for two empty values", () => {
    expect(compareInlineMarkup("", "").matches).toBe(true);
  });
});

describe("compareInlineMarkup: the multiset of tags", () => {
  it("matches a faithful translation that carries the same tags", () => {
    expect(compareInlineMarkup("<b>Bold</b> text", "<b>Fetter</b> Text")).toEqual({
      matches: true,
      missing: [],
      extra: [],
      malformed: false,
    });
  });

  it("reports a dropped pair as missing", () => {
    expect(compareInlineMarkup("<b>Bold</b> text", "Fetter Text")).toEqual({
      matches: false,
      missing: ["</b>", "<b>"],
      extra: [],
      malformed: false,
    });
  });

  it("reports an invented pair as extra", () => {
    expect(compareInlineMarkup("<b>Bold</b>", "<b>Fett</b><i>!</i>")).toEqual({
      matches: false,
      missing: [],
      extra: ["</i>", "<i>"],
      malformed: false,
    });
  });

  it("reports a renamed tag as both missing and extra", () => {
    const result = compareInlineMarkup("<b>Bold</b>", "<strong>Fett</strong>");
    expect(result.matches).toBe(false);
    expect(result.missing).toEqual(["</b>", "<b>"]);
    expect(result.extra).toEqual(["</strong>", "<strong>"]);
  });

  it("counts occurrences, so dropping one of two identical pairs is a mismatch", () => {
    const result = compareInlineMarkup("<b>a</b> and <b>b</b>", "<b>a</b> und b");
    expect(result.matches).toBe(false);
    expect(result.missing).toEqual(["</b>", "<b>"]);
  });

  it("reports an added attribute name", () => {
    const result = compareInlineMarkup(
      '<a href="/x">Docs</a>',
      '<a href="/x" target="_blank">Doku</a>',
    );
    expect(result.matches).toBe(false);
    expect(result.missing).toEqual(["<a href>"]);
    expect(result.extra).toEqual(["<a href target>"]);
  });

  it("reports a dropped attribute name", () => {
    const result = compareInlineMarkup('<a href="/x">Docs</a>', "<a>Doku</a>");
    expect(result.matches).toBe(false);
    expect(result.missing).toEqual(["<a href>"]);
    expect(result.extra).toEqual(["<a>"]);
  });

  it("is blind to the order attributes are written in", () => {
    expect(
      compareInlineMarkup('<a href="/x" title="Docs">D</a>', '<a title="Doku" href="/x">D</a>')
        .matches,
    ).toBe(true);
  });
});

describe("compareInlineMarkup: attribute values are deliberately not compared", () => {
  it("accepts a translated title attribute", () => {
    expect(
      compareInlineMarkup(
        '<abbr title="Application Programming Interface">API</abbr>',
        '<abbr title="Programmierschnittstelle">API</abbr>',
      ).matches,
    ).toBe(true);
  });

  it("accepts a localized href", () => {
    expect(
      compareInlineMarkup('<a href="/pricing">Pricing</a>', '<a href="/de/preise">Preise</a>')
        .matches,
    ).toBe(true);
  });
});

describe("compareInlineMarkup: tag order is deliberately not a finding", () => {
  it("accepts sibling tags translated into a different word order", () => {
    expect(
      compareInlineMarkup(
        "<b>Save</b> then <i>close</i>",
        "<i>Schliessen</i> nach <b>Speichern</b>",
      ).matches,
    ).toBe(true);
  });
});

describe("compareInlineMarkup: well-formedness of the translated value", () => {
  it("reports mis-nested markup even when the multiset matches", () => {
    expect(compareInlineMarkup("<b>a</b><i>b</i>", "<b>a<i>b</b></i>")).toEqual({
      matches: false,
      missing: [],
      extra: [],
      malformed: true,
    });
  });

  it("reports a closing tag that precedes its opening tag", () => {
    const result = compareInlineMarkup("<b>a</b>", "</b>a<b>");
    expect(result.matches).toBe(false);
    expect(result.malformed).toBe(true);
  });

  it("reports an unclosed tag as a multiset mismatch rather than a nesting failure", () => {
    const result = compareInlineMarkup("<b>Bold</b>", "<b>Fett");
    expect(result.matches).toBe(false);
    expect(result.missing).toEqual(["</b>"]);
    expect(result.malformed).toBe(false);
  });
});

describe("compareInlineMarkup: self-closing and void elements", () => {
  it("matches a self-closing tag carried through", () => {
    expect(compareInlineMarkup("Line<br/>break", "Zeilen<br/>umbruch").matches).toBe(true);
  });

  it("treats the two spellings of a void element as the same tag", () => {
    expect(compareInlineMarkup("a<br/>b", "a<br>b")).toEqual({
      matches: true,
      missing: [],
      extra: [],
      malformed: false,
    });
  });

  it("treats a self-closing tag as distinct from the open tag of the same name", () => {
    const result = compareInlineMarkup("a<icon/>b", "a<icon>b");
    expect(result.matches).toBe(false);
    expect(result.missing).toEqual(["<icon/>"]);
    expect(result.extra).toEqual(["<icon>"]);
  });

  it("does not demand a closing tag for a void element", () => {
    expect(compareInlineMarkup("<p>a<br>b</p>", "<p>a<br>b</p>")).toEqual({
      matches: true,
      missing: [],
      extra: [],
      malformed: false,
    });
  });

  it("recognises an uppercase void element, so the source stays well formed and a drop is caught", () => {
    expect(compareInlineMarkup("<p>a<BR>b</p>", "<p>a b</p>")).toEqual({
      matches: false,
      missing: ["<BR>"],
      extra: [],
      malformed: false,
    });
  });

  it("treats the two spellings of an uppercase void element as the same tag", () => {
    expect(compareInlineMarkup("<p>a<BR/>b</p>", "<p>a<BR>b</p>").matches).toBe(true);
  });

  it("reports a dropped self-closing tag", () => {
    const result = compareInlineMarkup("a<icon/>b", "a b");
    expect(result.matches).toBe(false);
    expect(result.missing).toEqual(["<icon/>"]);
  });

  it("reports a dropped void element under its normalised spelling", () => {
    const result = compareInlineMarkup("a<br/>b", "a b");
    expect(result.matches).toBe(false);
    expect(result.missing).toEqual(["<br>"]);
  });
});

describe("compareInlineMarkup: numeric rich-text tags", () => {
  it("matches numeric tags carried through", () => {
    expect(compareInlineMarkup("Read <0>the docs</0>", "Lies <0>die Doku</0>").matches).toBe(true);
  });

  it("reports a renumbered tag", () => {
    const result = compareInlineMarkup("Read <0>docs</0>", "Lies <1>Doku</1>");
    expect(result.matches).toBe(false);
    expect(result.missing).toEqual(["</0>", "<0>"]);
    expect(result.extra).toEqual(["</1>", "<1>"]);
  });
});

describe("compareInlineMarkup: a source whose own markup is not well formed", () => {
  it("stays silent for an unclosed bracketed word, which is set aside rather than compared", () => {
    expect(compareInlineMarkup("<b>Bold", "Fett")).toEqual({
      matches: true,
      missing: [],
      extra: [],
      malformed: false,
    });
  });

  it("refuses dropping prose that an HTML parser reads as an unclosed tag with attributes", () => {
    expect(compareInlineMarkup("a<b and c>d", "voellig anders").matches).toBe(false);
  });

  it("refuses dropping the tags of a mis-nested source", () => {
    expect(compareInlineMarkup("<b>a<i>b</b></i>", "voellig anders").matches).toBe(false);
  });
});

describe("compareInlineMarkup: markup invented where the source had none", () => {
  it("reports well-formed markup the source never had", () => {
    const result = compareInlineMarkup("Save changes", "<b>Anderungen speichern</b>");
    expect(result.matches).toBe(false);
    expect(result.extra).toEqual(["</b>", "<b>"]);
    expect(result.missing).toEqual([]);
  });

  it("stays silent for an unclosed bracketed word that is not an HTML element name", () => {
    expect(compareInlineMarkup("Press Enter", "Druecke <Enter>").matches).toBe(true);
  });

  it("stays silent for several unclosed bracketed words, none of them an HTML element name", () => {
    expect(compareInlineMarkup("Press Ctrl and C", "Druecke <Ctrl> und <C>").matches).toBe(true);
  });

  it("refuses an unclosed script tag", () => {
    expect(compareInlineMarkup("Hello", "Hallo <script>alert(1)")).toEqual({
      matches: false,
      missing: [],
      extra: ["<script>"],
      malformed: false,
    });
  });

  it("refuses an unclosed HTML element whatever case its name is written in", () => {
    const result = compareInlineMarkup("Hello", "Hallo <DIV>Welt");
    expect(result.matches).toBe(false);
    expect(result.extra).toEqual(["<DIV>"]);
  });

  it("refuses a closing tag with no opening tag", () => {
    expect(compareInlineMarkup("Hello", "Hallo</div>")).toEqual({
      matches: false,
      missing: [],
      extra: ["</div>"],
      malformed: false,
    });
  });

  it("refuses a closing tag whose name matches no opening tag beside a bracketed word", () => {
    const result = compareInlineMarkup("Press Enter", "Druecke <Enter></Tab>");
    expect(result.matches).toBe(false);
    expect(result.extra).toEqual(["</Tab>"]);
  });

  it("refuses a closed pair hidden behind a bracketed word that keeps the value unbalanced", () => {
    const result = compareInlineMarkup("Press Enter", "Druecke <Enter> <script>alert(1)</script>");
    expect(result.matches).toBe(false);
    expect(result.extra).toEqual(["</script>", "<script>"]);
  });

  it("refuses a void or self-closing tag hidden behind a bracketed word", () => {
    const result = compareInlineMarkup(
      "Press Enter",
      'Druecke <Enter> <img src="x" onerror="y"> <icon/>',
    );
    expect(result.matches).toBe(false);
    expect(result.extra).toEqual(["<icon/>", "<img onerror src>"]);
  });

  it("names a closed pair around an unclosed bracketed word without naming the word", () => {
    const result = compareInlineMarkup("Press Enter", "<b>Druecke <Enter></b>");
    expect(result.matches).toBe(false);
    expect(result.extra).toEqual(["</b>", "<b>"]);
  });
});

describe("compareInlineMarkup: only an attribute-free bracketed word is read as prose", () => {
  it("refuses an unclosed bracketed word that carries attributes", () => {
    expect(
      compareInlineMarkup("Press Enter", "Drücke <Enter tabindex=1 autofocus onfocus=alert(1)>"),
    ).toEqual({
      matches: false,
      missing: [],
      extra: ["<Enter autofocus onfocus tabindex>"],
      malformed: false,
    });
  });

  it("refuses an unclosed custom element that carries an event handler", () => {
    expect(compareInlineMarkup("Press Enter", "Drücke <x-key onmouseover=alert(1)>Enter")).toEqual({
      matches: false,
      missing: [],
      extra: ["<x-key onmouseover>"],
      malformed: false,
    });
  });

  it("accepts an unclosed bracketed word with nothing but its name", () => {
    expect(compareInlineMarkup("Press Enter", "Drücke <Enter>")).toEqual({
      matches: true,
      missing: [],
      extra: [],
      malformed: false,
    });
  });

  it("refuses an unclosed bracketed word written with whitespace before its bracket", () => {
    const result = compareInlineMarkup("Press Enter", "Drücke <Enter >");
    expect(result.matches).toBe(false);
    expect(result.extra).toEqual(["<Enter>"]);
  });

  it("refuses an unclosed tag whose name is more than letters, digits, hyphens and underscores", () => {
    const result = compareInlineMarkup("Press Enter", "Drücke <x.key>");
    expect(result.matches).toBe(false);
    expect(result.extra).toEqual(["<x.key>"]);
  });
});

describe("compareInlineMarkup: a bracketed word in the source is set aside, not read as malformed markup", () => {
  it("still refuses a dropped pair beside a bracketed word the source carries", () => {
    expect(
      compareInlineMarkup("Press <Enter> to <b>save</b>", "Drücke <Enter> zum Speichern"),
    ).toEqual({ matches: false, missing: ["</b>", "<b>"], extra: [], malformed: false });
  });

  it("still refuses a pair invented beside a bracketed word the source carries", () => {
    expect(
      compareInlineMarkup("Press <Enter> to continue", "Drücke <Enter> <script>alert(1)</script>"),
    ).toEqual({ matches: false, missing: [], extra: ["</script>", "<script>"], malformed: false });
  });

  it("accepts a translation that keeps the bracketed word", () => {
    expect(
      compareInlineMarkup("Press <Enter> to continue", "Drücke <Enter> zum Fortfahren"),
    ).toEqual({ matches: true, missing: [], extra: [], malformed: false });
  });

  it.each(["Press <Enter> to <b>save</b>", "Press <Enter> to continue"])(
    "accepts %j translated as itself",
    (value) => {
      expect(compareInlineMarkup(value, value)).toEqual({
        matches: true,
        missing: [],
        extra: [],
        malformed: false,
      });
    },
  );

  it("counts bracketed words like tags once the source carries tags", () => {
    expect(compareInlineMarkup("Press <Enter> to <b>save</b>", "Drücke <b>speichern</b>")).toEqual({
      matches: false,
      missing: ["<Enter>"],
      extra: [],
      malformed: false,
    });
    expect(
      compareInlineMarkup("Press <Enter> to <b>save</b>", "Drücke <Enter> <Tab> <b>speichern</b>"),
    ).toEqual({ matches: false, missing: [], extra: ["<Tab>"], malformed: false });
  });

  it("matches an unclosed opening tag against the same tag closed in the source", () => {
    expect(compareInlineMarkup("<b>Bold</b>", "<b>Fett")).toEqual({
      matches: false,
      missing: ["</b>"],
      extra: [],
      malformed: false,
    });
  });
});

describe("compareInlineMarkup: a bracketed word that is also an HTML element name", () => {
  it.each([
    ["Remove", "<Del>Entfernen", "<Del>"],
    ["Pick", "<Option> wählen", "<Option>"],
    ["Pick", "<Select> wählen", "<Select>"],
    ["Type", "<Input> eingeben", "<Input>"],
    ["Open", "<Menu> öffnen", "<Menu>"],
  ])("refuses %j translated as %j when the source has no such word", (source, translated, tag) => {
    expect(compareInlineMarkup(source, translated)).toEqual({
      matches: false,
      missing: [],
      extra: [tag],
      malformed: false,
    });
  });

  it("accepts the word once the source carries it too", () => {
    expect(compareInlineMarkup("Press <Del> to remove", "Drücke <Del> zum Entfernen").matches).toBe(
      true,
    );
    expect(compareInlineMarkup("Press <Input> to type", "Drücke <Input> zum Tippen").matches).toBe(
      true,
    );
  });

  it("still refuses markup invented beside a word the source carries", () => {
    expect(
      compareInlineMarkup("Press <Del> to remove", "Drücke <Del> <script>alert(1)</script>"),
    ).toEqual({ matches: false, missing: [], extra: ["</script>", "<script>"], malformed: false });
  });

  it("refuses a second copy of a word the source carries once", () => {
    const result = compareInlineMarkup("Press <Del> to remove", "Drücke <Del> oder <Del>");
    expect(result.matches).toBe(false);
    expect(result.extra).toEqual(["<Del>"]);
  });
});

describe("compareInlineMarkup: constructs that are not inline tags", () => {
  it.each([
    ["<!-- a comment -->", "<!-- a comment -->"],
    ["<![CDATA[raw]]>", "<![CDATA[raw]]>"],
    ['<?xml version="1.0"?>', '<?xml version="1.0"?>'],
    ["<!DOCTYPE html>", "<!DOCTYPE html>"],
  ])("accepts %j carried through unchanged", (source, translated) => {
    expect(compareInlineMarkup(source, translated).matches).toBe(true);
  });

  it("refuses a comment or CDATA section whose text the candidate changed", () => {
    expect(compareInlineMarkup("<!-- a comment -->", "<!-- ein Kommentar -->")).toEqual({
      matches: false,
      missing: ["<!-- a comment -->"],
      extra: ["<!-- ein Kommentar -->"],
      malformed: false,
    });
    expect(compareInlineMarkup("<![CDATA[raw]]>", "<![CDATA[roh]]>")).toEqual({
      matches: false,
      missing: ["<![CDATA[raw]]>"],
      extra: ["<![CDATA[roh]]>"],
      malformed: false,
    });
  });

  it("refuses an unterminated comment in the candidate, which would hide the rest of the value", () => {
    expect(compareInlineMarkup("<b>x</b>", "<!-- <b>x</b>")).toEqual({
      matches: false,
      missing: ["</b>", "<b>"],
      extra: ["<!-- <b>x</b>"],
      malformed: false,
    });
  });

  it("refuses an unterminated comment that closes on a bare angle bracket", () => {
    const result = compareInlineMarkup("Hello world", "Hallo <!-- Welt>");
    expect(result.matches).toBe(false);
    expect(result.extra).toEqual(["<!-- Welt>"]);
  });

  it("accepts an unterminated comment the source already carried with the same text", () => {
    expect(compareInlineMarkup("a <!-- b", "x <!-- b").matches).toBe(true);
  });

  it("refuses an unterminated comment whose hidden text the candidate changed", () => {
    const result = compareInlineMarkup("a <!-- b", "x <!-- y");
    expect(result.missing).toEqual(["<!-- b"]);
    expect(result.extra).toEqual(["<!-- y"]);
  });

  it("refuses a processing instruction the source never had", () => {
    expect(compareInlineMarkup("Hello", "Hallo <?php echo 1; ?>")).toEqual({
      matches: false,
      missing: [],
      extra: ["<?php echo 1; ?>"],
      malformed: false,
    });
  });

  it("refuses a declaration the source never had", () => {
    expect(compareInlineMarkup("Hello", "Hallo <!x>")).toEqual({
      matches: false,
      missing: [],
      extra: ["<!x>"],
      malformed: false,
    });
  });

  it("counts declarations and processing instructions, so a second copy is a finding", () => {
    const result = compareInlineMarkup("<!DOCTYPE html> a", "<!DOCTYPE html> a <!DOCTYPE html>");
    expect(result.matches).toBe(false);
    expect(result.extra).toEqual(["<!DOCTYPE html>"]);
  });

  it("reports a dropped declaration as missing", () => {
    const result = compareInlineMarkup('<?xml version="1.0"?> a', "a");
    expect(result.matches).toBe(false);
    expect(result.missing).toEqual(['<?xml version="1.0"?>']);
  });

  it("still compares constructs when the source's tags are not well formed", () => {
    expect(compareInlineMarkup("a<b and c>d", "a<b and c>d <?php ?>").matches).toBe(false);
  });

  it("ignores a comment that would otherwise look unbalanced next to real markup", () => {
    expect(compareInlineMarkup("<b>a</b><!-- <i> -->", "<b>a</b><!-- <i> -->").matches).toBe(true);
  });
});

describe("compareInlineMarkup: comments and bogus comments end where an HTML parser ends them", () => {
  it.each([
    ["Hallo <!--><img src=x onerror=alert(1)>-->", ["<!---->", "<img onerror src>"]],
    ["Hallo <!---><img src=x onerror=alert(1)>-->", ["<!---->", "<img onerror src>"]],
    ["Hallo <!-- --!><img src=x onerror=alert(1)> -->", ["<!-- -->", "<img onerror src>"]],
    ["Hallo <![CDATA[><img src=x onerror=alert(1)>]]>", ["<![CDATA[>", "<img onerror src>"]],
    ["Hallo <!x><img src=x onerror=alert(1)>", ["<!x>", "<img onerror src>"]],
    ["Hallo <?x > <img src=x onerror=alert(1)> ?>", ["<?x >", "<img onerror src>"]],
    ["Hallo </ x><img src=x onerror=alert(1)>", ["</ x>", "<img onerror src>"]],
    ["Hallo <!-- a -->", ["<!-- a -->"]],
    ["Hallo <!---->", ["<!---->"]],
    ["Hallo <!----!> x", ["<!---->"]],
    ["Hallo <!--!> x", ["<!--!> x"]],
    ["Hallo <!> x", ["<!>"]],
    ["Hallo </>", ["</>"]],
    ["Hallo <?php echo <b>x</b>", ["</b>", "<?php echo <b>"]],
    ["Hallo <![CDATA[ unterminated", ["<![CDATA[ unterminated"]],
  ])("refuses %j against a source with no markup", (translated, extra) => {
    expect(compareInlineMarkup("Hello", translated)).toEqual({
      matches: false,
      missing: [],
      extra,
      malformed: false,
    });
  });

  it.each([
    "<b>a</b><!-- note -->",
    "<![CDATA[raw]]> text",
    "<![CDATA[a > b]]>",
    "<![CDATA[<b>bold</b>]]>",
    "Hi <!--> there <b>x</b>",
    "Hi <!---> there",
    "<!-- x --!> <i>y</i>",
    "a <!-- b <b>c</b>",
    "<?php if ($a > 1) ?> ok",
    "Press </ x> now",
  ])("accepts %j translated as itself", (value) => {
    expect(compareInlineMarkup(value, value)).toEqual({
      matches: true,
      missing: [],
      extra: [],
      malformed: false,
    });
  });

  it("compares a comment by its text with runs of whitespace collapsed", () => {
    expect(compareInlineMarkup("<!--  a\n b -->", "<!-- a b -->").matches).toBe(true);
  });

  it("reports a construct finding together with the tag findings in the same value", () => {
    expect(compareInlineMarkup("<b>a</b>", "<!-- x -->a <i>b</i>")).toEqual({
      matches: false,
      missing: ["</b>", "<b>"],
      extra: ["<!-- x -->", "</i>", "<i>"],
      malformed: false,
    });
  });

  it("counts constructs against the ceiling, so a flood of them is refused", () => {
    expect(compareInlineMarkup("Hello", `Hallo${"<!---->".repeat(300)}`)).toEqual({
      matches: false,
      missing: [],
      extra: [],
      malformed: false,
      tagLimitExceeded: 256,
    });
  });
});

describe("compareInlineMarkup: adversarial input", () => {
  it("keeps comparing a value that carries more than 256 tags", () => {
    const source = "<b>x</b>".repeat(400);
    const translated = "<b>x</b>".repeat(399);
    expect(compareInlineMarkup(source, translated).matches).toBe(false);
  });

  it("returns promptly for a long run of angle brackets that are not tags", () => {
    const noise = "<".repeat(50_000);
    expect(compareInlineMarkup(noise, noise).matches).toBe(true);
  });

  it("returns promptly for a long tag-shaped value with no closing bracket", () => {
    const noise = `<a ${"x".repeat(50_000)}`;
    expect(compareInlineMarkup(noise, noise).matches).toBe(true);
  });
});

describe("compareInlineMarkup: what is deliberately not read as a tag still lets a real finding through", () => {
  it("skips a tag written inside a comment, so the markup around it is still compared", () => {
    const result = compareInlineMarkup("<b>a</b><!-- <i> -->", "a");
    expect(result.matches).toBe(false);
    expect(result.missing).toEqual(["<!-- <i> -->", "</b>", "<b>"]);
  });

  it("reads an angle-bracketed address the way an HTML parser does, as an invented tag", () => {
    expect(compareInlineMarkup("<b>ok</b>", "<b>Mail <support@example.com> ok</b>")).toEqual({
      matches: false,
      missing: [],
      extra: ["<support@example.com>"],
      malformed: false,
    });
  });

  it("does not read a less-than sign followed by a digit as a numeric rich-text tag", () => {
    const result = compareInlineMarkup("<b>I <3 this > that</b>", "Ich mag das");
    expect(result.matches).toBe(false);
    expect(result.missing).toEqual(["</b>", "<b>"]);
  });

  it("compares the markup around a void element instead of giving up on the value", () => {
    const result = compareInlineMarkup("<p>a<br>b</p>", "<p>a b</p>");
    expect(result.matches).toBe(false);
    expect(result.missing).toEqual(["<br>"]);
  });
});

describe("compareInlineMarkup: the shape an angle-bracket run has to have to count as a tag", () => {
  it("accepts trailing whitespace inside an opening tag", () => {
    const result = compareInlineMarkup("<b >Bold</b>", "Fett");
    expect(result.matches).toBe(false);
    expect(result.missing).toEqual(["</b>", "<b>"]);
  });

  it("reads an attribute written straight after a quoted value, as an HTML parser does", () => {
    expect(compareInlineMarkup('<a href="/x"junk>Docs</a>', "Doku")).toEqual({
      matches: false,
      missing: ["</a>", "<a href junk>"],
      extra: [],
      malformed: false,
    });
  });

  it("reads a closing tag that carries attributes as the closing tag, as an HTML parser does", () => {
    expect(compareInlineMarkup("<b>a</b junk>", "a")).toEqual({
      matches: false,
      missing: ["</b>", "<b>"],
      extra: [],
      malformed: false,
    });
  });
});

describe("compareInlineMarkup: tags the caller's format already reports as placeholders", () => {
  it("ignores an opening tag it is given, and the closing tag that pairs with it", () => {
    expect(
      compareInlineMarkup("Read <b>the docs</b>", "Lies die Doku", { ignoreTags: ["<b>"] }),
    ).toEqual({ matches: true, missing: [], extra: [], malformed: false });
  });

  it("ignores every occurrence of that pair, however many arms repeat it", () => {
    expect(
      compareInlineMarkup("<b>a</b> und <b>b</b>", "<b>a</b> <b>b</b> <b>c</b> <b>d</b>", {
        ignoreTags: ["<b>"],
      }).matches,
    ).toBe(true);
  });

  it("refuses a closing tag beyond the opening tags it ignores, counting per value", () => {
    expect(
      compareInlineMarkup('Read <g id="1">the docs</g>', 'Lies <g id="1">Doku</g></g>', {
        ignoreTags: ["<g id>"],
      }),
    ).toEqual({ matches: false, missing: [], extra: ["</g>"], malformed: false });
  });

  it("refuses a closing tag that comes before the ignored opening tag it would pair with", () => {
    const result = compareInlineMarkup('Read <g id="1">the docs</g>', 'Lies </g><g id="1">Doku', {
      ignoreTags: ["<g id>"],
    });
    expect(result.matches).toBe(false);
    expect(result.extra).toEqual(["</g>"]);
  });

  it("counts closing tags against ignored opening tags even when the closing token is listed too", () => {
    const result = compareInlineMarkup("Read <b>docs</b>", "Lies <b>Doku</b></b>", {
      ignoreTags: ["<b>", "</b>"],
    });
    expect(result.matches).toBe(false);
    expect(result.extra).toEqual(["</b>"]);
  });

  it("still compares a tag the format does not report, beside one it does", () => {
    const result = compareInlineMarkup(
      "Read <b>the docs</b>.<br/>Then go.",
      "Lies <b>die Doku</b>. Dann los.",
      { ignoreTags: ["<b>"] },
    );
    expect(result.matches).toBe(false);
    expect(result.missing).toEqual(["<br>"]);
  });

  it("does not ignore a second spelling of the same name that the format never reported", () => {
    const result = compareInlineMarkup("Read <b>the docs</b> and <b/>", "Lies <b>die Doku</b>", {
      ignoreTags: ["<b>"],
    });
    expect(result.matches).toBe(false);
    expect(result.missing).toEqual(["<b/>"]);
  });

  it("does not let an ignored tag's own nesting decide whether the source is well formed", () => {
    const result = compareInlineMarkup('Read <g id="1">the docs</g><br/>now', "Lies die Doku", {
      ignoreTags: ["<g id>"],
    });
    expect(result.matches).toBe(false);
    expect(result.missing).toEqual(["<br>"]);
  });

  it("refuses an ignored opening tag left unclosed at the end of the value", () => {
    expect(
      compareInlineMarkup('Read <g id="1">the docs</g>', 'Lies <g id="1">Doku', {
        ignoreTags: ["<g id>"],
      }),
    ).toEqual({ matches: false, missing: ["</g>"], extra: [], malformed: false });
  });

  it("refuses an ignored opening tag left unclosed beside other compared markup", () => {
    expect(
      compareInlineMarkup('Read <g id="1">the <b>docs</b></g>', 'Lies <g id="1">die <b>Doku</b>', {
        ignoreTags: ["<g id>"],
      }),
    ).toEqual({ matches: false, missing: ["</g>"], extra: [], malformed: false });
  });

  it("accepts an ignored opening tag the source leaves unclosed the same number of times", () => {
    expect(
      compareInlineMarkup('Read <g id="1">the docs', 'Lies <g id="1">die Doku', {
        ignoreTags: ["<g id>"],
      }).matches,
    ).toBe(true);
  });

  it("leaves an ignored self-closing tag out of the unclosed count", () => {
    expect(
      compareInlineMarkup('Read <x id="1"/> now', 'Lies <x id="1"/> jetzt', {
        ignoreTags: ["<x id/>"],
      }).matches,
    ).toBe(true);
  });

  it("ignores a self-closing tag it is given without ignoring the paired spelling", () => {
    const result = compareInlineMarkup("<x id/> and <x>a</x>", "<x id/>", {
      ignoreTags: ["<x id/>"],
    });
    expect(result.matches).toBe(false);
    expect(result.missing).toEqual(["</x>", "<x>"]);
  });

  it("ignores a token that appears in neither value without inventing a finding", () => {
    expect(
      compareInlineMarkup("<b>a</b>", "<b>a</b>", { ignoreTags: ["<x>", "<g>"] }).matches,
    ).toBe(true);
  });

  it("ignores a token that is not a tag at all without inventing a finding", () => {
    expect(
      compareInlineMarkup("<b>a</b>", "<b>a</b>", { ignoreTags: ["{count}", "%1$s"] }).matches,
    ).toBe(true);
  });
});

describe("compareInlineMarkup: repeated tags are counted, not just noticed", () => {
  it("refuses a value that dropped one of two identical pairs", () => {
    const result = compareInlineMarkup("<b>a</b> and <b>b</b>", "<b>a</b> und b");
    expect(result.matches).toBe(false);
    expect(result.missing).toEqual(["</b>", "<b>"]);
  });

  it("refuses two adjacent pairs merged into one, which changes what is inside the tag", () => {
    const result = compareInlineMarkup("<b>a</b> <b>b</b>", "<b>a b</b>");
    expect(result.matches).toBe(false);
    expect(result.missing).toEqual(["</b>", "<b>"]);
  });
});

describe("compareInlineMarkup: a reorder that nests a tag inside another of the same name", () => {
  it("refuses two sibling anchors that come back nested", () => {
    const result = compareInlineMarkup(
      '<a href="/a">one</a> and <a href="/b">two</a>',
      '<a href="/a">eins und <a href="/b">zwei</a></a>',
    );
    expect(result.matches).toBe(false);
    expect(result.malformed).toBe(true);
  });

  it("refuses two sibling list items that come back nested", () => {
    const result = compareInlineMarkup("<li>a</li><li>b</li>", "<li>a<li>b</li></li>");
    expect(result.matches).toBe(false);
    expect(result.malformed).toBe(true);
  });

  it("accepts same-name nesting the source already had", () => {
    expect(
      compareInlineMarkup(
        "<span>outer <span>inner</span></span>",
        "<span>aussen <span>innen</span></span>",
      ).matches,
    ).toBe(true);
  });

  it("still accepts an ordinary sibling reorder of the same tag", () => {
    expect(
      compareInlineMarkup(
        '<a href="/a">one</a> and <a href="/b">two</a>',
        '<a href="/b">zwei</a> und <a href="/a">eins</a>',
      ).matches,
    ).toBe(true);
  });
});

describe("compareInlineMarkup: an angle bracket inside an attribute value", () => {
  it("reads past it inside quotes, so the tag is still compared", () => {
    expect(compareInlineMarkup('<abbr title="a > b">x</abbr>', "voellig anders")).toEqual({
      matches: false,
      missing: ["</abbr>", "<abbr title>"],
      extra: [],
      malformed: false,
    });
  });
});

describe("compareInlineMarkup: tag names are compared exactly, void elements recognised in any case", () => {
  it("treats a case change as a different tag", () => {
    const result = compareInlineMarkup("<b>a</b>", "<B>a</B>");
    expect(result.matches).toBe(false);
    expect(result.missing).toEqual(["</b>", "<b>"]);
    expect(result.extra).toEqual(["</B>", "<B>"]);
  });

  it("gives void handling to every case spelling of a void element", () => {
    expect(compareInlineMarkup("a<BR>b", "voellig anders")).toEqual({
      matches: false,
      missing: ["<BR>"],
      extra: [],
      malformed: false,
    });
    expect(compareInlineMarkup("a<br>b", "voellig anders")).toEqual({
      matches: false,
      missing: ["<br>"],
      extra: [],
      malformed: false,
    });
  });

  it("compares an uppercase element that is properly closed like any other", () => {
    expect(compareInlineMarkup("<BR>a</BR>", "<BR>b</BR>").matches).toBe(true);
  });
});

describe("compareInlineMarkup: tags are read the way an HTML parser reads them", () => {
  it.each([
    ['Hallo <a"b onmouseover=alert(1)>Welt', ['<a"b onmouseover>']],
    ['Hallo <img title=">" src=x onerror=alert(1)>', ["<img onerror src title>"]],
    ["Hallo <img/src/onerror=alert(1)>", ["<img onerror src>"]],
    ["Hallo <x onclick=alert(1)>", ["<x onclick>"]],
    ["Hallo <b\tonmouseover=alert(1)>x</b>", ["</b>", "<b onmouseover>"]],
    ["Hallo <a href=x'y onclick=z>", ["<a href onclick>"]],
    ["Hallo <p =x>", ["<p =x>"]],
    ["Hallo <details open ontoggle=alert(1)>", ["<details ontoggle open>"]],
    ["Hallo <b a=1/>", ["<b a>"]],
    ["Hallo <i/>", ["<i/>"]],
  ])("refuses %j against a source with no markup", (translated, extra) => {
    expect(compareInlineMarkup("Hello", translated)).toEqual({
      matches: false,
      missing: [],
      extra,
      malformed: false,
    });
  });

  it("refuses an event handler hidden behind a closing angle bracket inside a quoted value", () => {
    expect(compareInlineMarkup("<b>a</b>", '<b title="</b>" onmouseover=x>a</b>')).toEqual({
      matches: false,
      missing: ["<b>"],
      extra: ["<b onmouseover title>"],
      malformed: false,
    });
  });

  it.each(["Hallo <0 x>", "Hallo </0 x>", "Hallo <1", "Hallo </"])(
    "reads %j as text or as a tag the parser never finishes, so nothing is invented",
    (value) => {
      expect(compareInlineMarkup("Hello", value).matches).toBe(true);
    },
  );

  it.each([
    '<a title="x > y">z</a>',
    "a<b and c>d",
    "Mail us at <support@example.com>",
    "Compare with <b",
    "<0>x</0> <1/> </2 >",
    "<a href=/x/>y</a>",
    "<p =x>y</p>",
  ])("accepts %j translated as itself", (value) => {
    expect(compareInlineMarkup(value, value).matches).toBe(true);
  });
});

function scanSteps(run: () => void): number {
  const { indexOf, charCodeAt } = String.prototype;
  let steps = 0;
  String.prototype.indexOf = function (this: string, needle: string, from?: number): number {
    const start = from ?? 0;
    const found = indexOf.call(this, needle, start);
    steps += (found === -1 ? this.length : found) - start + 1;
    return found;
  };
  String.prototype.charCodeAt = function (this: string, index: number): number {
    steps += 1;
    return charCodeAt.call(this, index);
  };
  try {
    run();
  } finally {
    String.prototype.indexOf = indexOf;
    String.prototype.charCodeAt = charCodeAt;
  }
  return steps;
}

describe("compareInlineMarkup: the scan does work in proportion to the value's length", () => {
  it.each([
    ["an unterminated comment opener repeated", "<!--".repeat(25_000)],
    ["a tag name that never closes", `<${"a".repeat(100_000)}`],
    ["a CDATA opener repeated", "<![CDATA[".repeat(10_000)],
    ["empty comments before a lone bang terminator", `${"<!---->".repeat(14_000)}--!>`],
    ["bang-terminated comments before a lone dash terminator", `${"<!----!>".repeat(12_500)}-->`],
    ["an attribute value whose quote never closes", `<a title="${"x".repeat(100_000)}`],
    ["a run of tag openers inside one tag name", "<a".repeat(50_000)],
    ["numeric openers that never become tags", "<1".repeat(50_000)],
    ["an end tag that never closes", `</a${" x".repeat(50_000)}`],
    ["attributes that never close", `<a${" x=y".repeat(25_000)}`],
  ])("scans %s in a bounded number of steps", (_label, noise) => {
    const steps = scanSteps(() => compareInlineMarkup(noise, noise));
    expect(steps).toBeGreaterThanOrEqual(noise.length);
    expect(steps).toBeLessThanOrEqual(noise.length * 12);
  });
});

describe("inlineTagToken", () => {
  it.each([
    ["<b>", "<b>"],
    ["</b>", "</b>"],
    ['<g id="1">', "<g id>"],
    ['<x id="2"/>', "<x id/>"],
    ["<br/>", "<br>"],
    ["<0>", "<0>"],
    ['<a title=">">', "<a title>"],
  ])("canonicalizes %j to %j", (token, canonical) => {
    expect(inlineTagToken(token)).toBe(canonical);
  });

  it.each(["{count}", "%1$s", "$t(a.b)", "<not a tag", "<a>trailing", "", "<a><b>"])(
    "reads no tag from %j",
    (token) => {
      expect(inlineTagToken(token)).toBeUndefined();
    },
  );
});

describe("compareInlineMarkup: both spellings of one name accounted for", () => {
  const BOTH = ['<x id="1"/>', '<x id="1">'];

  it("stands the whole name down, so a value that dropped all of it still matches", () => {
    expect(
      compareInlineMarkup('<x id="1"/> and <x id="1">a</x>', "nichts", { ignoreTags: BOTH })
        .matches,
    ).toBe(true);
  });

  it("still compares a different name carried in the same value", () => {
    const result = compareInlineMarkup(
      '<x id="1"/> and <x id="1">a</x><br/>b',
      '<x id="1"/> und <x id="1">a</x>b',
      { ignoreTags: BOTH },
    );
    expect(result.matches).toBe(false);
    expect(result.missing).toEqual(["<br>"]);
  });

  it("ignores a closing tag it is handed on its own without ignoring its opening one", () => {
    const result = compareInlineMarkup("<b>a</b><br/>b", "a b", { ignoreTags: ["</b>"] });
    expect(result).toEqual({
      matches: false,
      missing: ["<b>", "<br>"],
      extra: [],
      malformed: false,
    });
  });
});

describe("compareInlineMarkup: the tag-count ceiling bounds only the candidate", () => {
  const FLOOD = "<i>x</i>".repeat(150);

  it("refuses a candidate that carries more tags than the scanner will read, naming the limit", () => {
    expect(compareInlineMarkup("<b>a</b>", `b${FLOOD}`)).toEqual({
      matches: false,
      missing: [],
      extra: [],
      malformed: false,
      tagLimitExceeded: 256,
    });
  });

  it("refuses an empty invented flood against a small source", () => {
    const result = compareInlineMarkup("<b>x</b>", `x${"<i></i>".repeat(200)}`);
    expect(result.matches).toBe(false);
    expect(result.tagLimitExceeded).toBe(256);
  });

  it("refuses a flood against a source with no markup at all", () => {
    expect(compareInlineMarkup("Save", `Speichern${"<i></i>".repeat(200)}`).matches).toBe(false);
  });

  it("keeps comparing when both the source and the candidate exceed 256 tags", () => {
    expect(compareInlineMarkup("<b>x</b>".repeat(400), "nichts").matches).toBe(false);
    expect(compareInlineMarkup("<b>x</b>".repeat(400), "<i>y</i>".repeat(400)).matches).toBe(false);
  });

  it("accepts a candidate that sits exactly at the ceiling when the source does too", () => {
    const atCeiling = "<b>x</b>".repeat(128);
    expect(compareInlineMarkup(atCeiling, atCeiling).matches).toBe(true);
  });

  it("still compares the same shape when the candidate stays under the ceiling", () => {
    const result = compareInlineMarkup("<b>a</b>", `b${"<i>x</i>".repeat(100)}`);
    expect(result.matches).toBe(false);
    expect(result.missing).toEqual(["</b>", "<b>"]);
  });

  it("refuses a total markup loss from a source that carries more than 256 tags", () => {
    expect(compareInlineMarkup(`${"<b>a</b>".repeat(130)}<em>k</em>`, "nichts").matches).toBe(
      false,
    );
  });
});
