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

  it("stands down for an uppercase void element, which is not one of the names it knows", () => {
    expect(compareInlineMarkup("<p>a<BR>b</p>", "<p>a b</p>").matches).toBe(true);
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
  it("stays silent, because the source is not treating its brackets as markup", () => {
    expect(compareInlineMarkup("<b>Bold", "Fett")).toEqual({
      matches: true,
      missing: [],
      extra: [],
      malformed: false,
    });
  });

  it("stays silent for a mis-nested source", () => {
    expect(compareInlineMarkup("<b>a<i>b</b></i>", "voellig anders").matches).toBe(true);
  });
});

describe("compareInlineMarkup: markup invented where the source had none", () => {
  it("reports well-formed markup the source never had", () => {
    const result = compareInlineMarkup("Save changes", "<b>Anderungen speichern</b>");
    expect(result.matches).toBe(false);
    expect(result.extra).toEqual(["</b>", "<b>"]);
    expect(result.missing).toEqual([]);
  });

  it("stays silent when the invented brackets do not form well-formed markup", () => {
    expect(compareInlineMarkup("Press Enter", "Druecke <Enter>").matches).toBe(true);
  });
});

describe("compareInlineMarkup: constructs that are not inline tags", () => {
  it.each([
    ["<!-- a comment -->", "<!-- ein Kommentar -->"],
    ["<![CDATA[raw]]>", "<![CDATA[roh]]>"],
    ['<?xml version="1.0"?>', '<?xml version="1.0"?>'],
    ["<!DOCTYPE html>", "<!DOCTYPE html>"],
  ])("ignores %j", (source, translated) => {
    expect(compareInlineMarkup(source, translated).matches).toBe(true);
  });

  it("ignores a comment that would otherwise look unbalanced next to real markup", () => {
    expect(compareInlineMarkup("<b>a</b><!-- <i> -->", "<b>a</b><!-- <i> -->").matches).toBe(true);
  });
});

describe("compareInlineMarkup: adversarial input", () => {
  it("stays silent rather than guessing once a value carries more tags than it can reason about", () => {
    const source = "<b>x</b>".repeat(400);
    const translated = "<b>x</b>".repeat(399);
    expect(compareInlineMarkup(source, translated).matches).toBe(true);
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
    expect(result.missing).toEqual(["</b>", "<b>"]);
  });

  it("does not read an angle-bracketed address as an invented tag", () => {
    expect(compareInlineMarkup("<b>ok</b>", "<b>Mail <support@example.com> ok</b>").matches).toBe(
      true,
    );
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

  it("rejects an opening tag whose attribute list does not parse", () => {
    expect(compareInlineMarkup('<a href="/x"junk>Docs</a>', "Doku").matches).toBe(true);
  });

  it("rejects a closing tag that carries anything but whitespace", () => {
    expect(compareInlineMarkup("<b>a</b junk>", "a").matches).toBe(true);
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
  it("stands down rather than guessing, because the tag no longer parses", () => {
    expect(compareInlineMarkup('<abbr title="a > b">x</abbr>', "voellig anders").matches).toBe(
      true,
    );
  });
});

describe("compareInlineMarkup: tag names are compared exactly, void elements included", () => {
  it("treats a case change as a different tag", () => {
    const result = compareInlineMarkup("<b>a</b>", "<B>a</B>");
    expect(result.matches).toBe(false);
    expect(result.missing).toEqual(["</b>", "<b>"]);
    expect(result.extra).toEqual(["</B>", "<B>"]);
  });

  it("gives void handling to the lowercase spelling only, so an uppercase one needs closing", () => {
    expect(compareInlineMarkup("a<BR>b", "voellig anders").matches).toBe(true);
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

describe("inlineTagToken", () => {
  it.each([
    ["<b>", "<b>"],
    ["</b>", "</b>"],
    ['<g id="1">', "<g id>"],
    ['<x id="2"/>', "<x id/>"],
    ["<br/>", "<br>"],
    ["<0>", "<0>"],
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
    expect(result.matches).toBe(true);
  });
});

describe("compareInlineMarkup: the tag-count ceiling stands down only for the source", () => {
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

  it("stands down when both the source and the candidate exceed the ceiling", () => {
    expect(compareInlineMarkup("<b>x</b>".repeat(400), "nichts").matches).toBe(true);
    expect(compareInlineMarkup("<b>x</b>".repeat(400), "<i>y</i>".repeat(400)).matches).toBe(true);
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

  it("goes quiet for a source that carries more tags than the scanner will read", () => {
    expect(compareInlineMarkup(`${"<b>a</b>".repeat(130)}<em>k</em>`, "nichts").matches).toBe(true);
  });
});
