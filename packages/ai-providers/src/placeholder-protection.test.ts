import { describe, expect, it } from "vitest";
import {
  containsMarkupTag,
  decodeMaskedFromHtml,
  decodeMaskedFromXml,
  encodeMaskedForHtml,
  encodeMaskedForXml,
  maskPlaceholders,
  partitionByPlaceholders,
  partitionForMasking,
  restoreTranslations,
  unmaskPlaceholders,
} from "./placeholder-protection.js";
import { entry } from "./test-support.js";

describe("partitionByPlaceholders", () => {
  it("splits placeholder-free (protectable) from placeholder-bearing (unprotectable)", () => {
    const free = entry("a", "Hello");
    const bearing = entry("b", "Hello {{name}}", ["{{name}}"]);
    const { protectable, unprotectable } = partitionByPlaceholders([free, bearing]);
    expect(protectable).toEqual([free]);
    expect(unprotectable).toEqual([bearing]);
  });

  it("returns empty partitions for an empty batch", () => {
    const { protectable, unprotectable } = partitionByPlaceholders([]);
    expect(protectable).toEqual([]);
    expect(unprotectable).toEqual([]);
  });

  it("preserves relative order so protectable is an order-preserving subsequence", () => {
    const first = entry("first", "one");
    const skip = entry("skip", "has {{x}}", ["{{x}}"]);
    const second = entry("second", "two");
    const { protectable, unprotectable } = partitionByPlaceholders([first, skip, second]);
    expect(protectable.map((e) => e.key)).toEqual(["first", "second"]);
    expect(unprotectable.map((e) => e.key)).toEqual(["skip"]);
  });
});

describe("maskPlaceholders", () => {
  it("replaces each placeholder occurrence with a numbered marker in document order", () => {
    expect(maskPlaceholders("Hi {name}, you have {count} messages", ["{name}", "{count}"])).toEqual(
      { text: "Hi {0}, you have {1} messages", originals: ["{name}", "{count}"] },
    );
  });

  it("numbers a repeated placeholder once per occurrence", () => {
    expect(maskPlaceholders("%s and %s", ["%s", "%s"])).toEqual({
      text: "{0} and {1}",
      originals: ["%s", "%s"],
    });
  });

  it("prefers the longest placeholder where two start at the same position", () => {
    expect(maskPlaceholders("Hello {{name}} and {name}", ["{name}", "{{name}}"])).toEqual({
      text: "Hello {0} and {1}",
      originals: ["{{name}}", "{name}"],
    });
  });

  it("masks inline markup placeholders, whose text would otherwise reach the engine", () => {
    expect(maskPlaceholders('Click <a href="/x">here</a>', ['<a href="/x">', "</a>"])).toEqual({
      text: "Click {0}here{1}",
      originals: ['<a href="/x">', "</a>"],
    });
  });

  it("declines a value with no non-empty placeholder", () => {
    expect(maskPlaceholders("Hello", [])).toBeUndefined();
    expect(maskPlaceholders("Hello", [""])).toBeUndefined();
  });

  it("declines an ICU value whose normalized placeholder does not occur literally", () => {
    expect(
      maskPlaceholders("{count, plural, one {# item} other {# items}}", ["{count}"]),
    ).toBeUndefined();
  });

  it("declines a value whose text around the placeholders still holds braces or angle brackets", () => {
    expect(maskPlaceholders("Hi {name}, {n, number} left", ["{name}"])).toBeUndefined();
    expect(maskPlaceholders("Use <b>{name}</b>", ["{name}"])).toBeUndefined();
  });

  it("keeps a surrogate pair intact around a marker", () => {
    expect(maskPlaceholders("\u{1F600} {name}", ["{name}"])?.text).toBe("\u{1F600} {0}");
  });
});

describe("maskPlaceholders with keepMarkup", () => {
  it("leaves markup tags in place, including tags that are placeholders, and masks the rest", () => {
    expect(
      maskPlaceholders("Hi {name}, open <b>settings</b>", ["{name}", "<b>"], { keepMarkup: true }),
    ).toEqual({ text: "Hi {0}, open <b>settings</b>", originals: ["{name}"] });
  });

  it("returns the value unchanged when every placeholder is a markup tag", () => {
    expect(maskPlaceholders("Open <b>settings</b>", ["<b>"], { keepMarkup: true })).toEqual({
      text: "Open <b>settings</b>",
      originals: [],
    });
  });

  it("still declines a stray brace beside the markup", () => {
    expect(
      maskPlaceholders("{n, plural, one {<b>#</b>}}", ["{n}", "<b>"], { keepMarkup: true }),
    ).toBeUndefined();
  });
});

describe("containsMarkupTag", () => {
  it.each(["<b>x</b>", "a<br/>b", '<a href="/x">y</a>', "</i>", "<my-tag>"])(
    "finds a tag in %s",
    (value) => {
      expect(containsMarkupTag(value)).toBe(true);
    },
  );

  it.each(["5 < 10 > 3", "<0>here</0>", "a <= b", "Tom & Jerry", "{name}"])(
    "finds no tag in %s",
    (value) => {
      expect(containsMarkupTag(value)).toBe(false);
    },
  );
});

describe("unmaskPlaceholders", () => {
  const masked = { text: "Hi {0}, you have {1} messages", originals: ["{name}", "{count}"] };

  it("restores every marker, including markers the engine reordered", () => {
    expect(unmaskPlaceholders("{1} Nachrichten für {0}", masked)).toBe(
      "{count} Nachrichten für {name}",
    );
  });

  it("round-trips a masked value the engine left unchanged", () => {
    const value = 'Click <a href="/x">here</a> or %1$s';
    const mask = maskPlaceholders(value, ['<a href="/x">', "</a>", "%1$s"]);
    expect(mask).toBeDefined();
    if (mask !== undefined) {
      expect(unmaskPlaceholders(mask.text, mask)).toBe(value);
    }
  });

  it("rejects a translation that dropped a marker", () => {
    expect(unmaskPlaceholders("Hallo {0}", masked)).toBeUndefined();
  });

  it("rejects a translation that duplicated a marker", () => {
    expect(unmaskPlaceholders("{0} {0} {1}", masked)).toBeUndefined();
  });

  it("rejects a translation that invented a marker the value never had", () => {
    expect(unmaskPlaceholders("{0} {1} {2}", masked)).toBeUndefined();
  });

  it("rejects a mangled marker, left as a stray brace", () => {
    expect(unmaskPlaceholders("{0} { 1}", masked)).toBeUndefined();
    expect(unmaskPlaceholders("{0} {01}", masked)).toBeUndefined();
  });
});

describe("partitionForMasking", () => {
  it("sorts entries into plain, masked, and unprotectable", () => {
    const plain = entry("plain", "Save");
    const simple = entry("simple", "Hi {name}", ["{name}"]);
    const icu = entry("icu", "{n, plural, one {# file} other {# files}}", ["{n}"]);
    const partition = partitionForMasking([plain, simple, icu]);
    expect(partition.plain).toEqual([plain]);
    expect(partition.masked).toEqual([
      { entry: simple, masked: { text: "Hi {0}", originals: ["{name}"] } },
    ]);
    expect(partition.unprotectable).toEqual([icu]);
  });

  it("keeps markup in place only when asked and only for a value that carries a tag", () => {
    const rich = entry("rich", "Open <b>settings</b>", ["<b>"]);

    expect(partitionForMasking([rich]).unprotectable).toEqual([rich]);
    expect(partitionForMasking([rich], { keepMarkup: true }).masked).toEqual([
      { entry: rich, masked: { text: "Open <b>settings</b>", originals: [] } },
    ]);
  });
});

describe("partitionForMasking with withholdMarkup", () => {
  it("withholds a placeholder-bearing value that carries a markup tag", () => {
    const rich = entry("rich", "Open <b>{name}</b>", ["{name}", "<b>", "</b>"]);
    expect(partitionForMasking([rich], { withholdMarkup: true }).unprotectable).toEqual([rich]);
    expect(partitionForMasking([rich]).masked).toHaveLength(1);
  });

  it("leaves a placeholder-free value with markup on the plain path", () => {
    const plain = entry("plain", "Open <b>settings</b>");
    expect(partitionForMasking([plain], { withholdMarkup: true }).plain).toEqual([plain]);
  });
});

describe("encodeMaskedForXml", () => {
  it("wraps each marker in an ignore tag and escapes the residual text", () => {
    expect(encodeMaskedForXml({ text: "Tom & {0} <3 {1}", originals: ["{{a}}", "%d"] })).toBe(
      "Tom &amp; <x>{0}</x> &lt;3 <x>{1}</x>",
    );
  });
});

describe("decodeMaskedFromXml", () => {
  it("unwraps markers and decodes entities", () => {
    expect(decodeMaskedFromXml("<x>{1}</x> &amp; <x>{0}</x> &quot;&apos;&#233;&#xE9;")).toBe(
      "{1} & {0} \"'\u00e9\u00e9",
    );
  });

  it("does not turn an escaped tag into a wrapper", () => {
    expect(decodeMaskedFromXml("&lt;x&gt;{0}&lt;/x&gt;")).toBeUndefined();
  });

  it.each([
    ["a bare marker", "Hallo {0}"],
    ["a wrapper with whitespace inside", "Hallo <x> {0} </x>"],
    ["an unknown tag", "Hallo <b>x</b> <x>{0}</x>"],
    ["an unknown entity", "Hallo&nbsp;<x>{0}</x>"],
    ["a bare ampersand", "Tom & <x>{0}</x>"],
    ["a surrogate code point", "&#xD800;<x>{0}</x>"],
    ["a code point beyond Unicode", "&#1114112;<x>{0}</x>"],
    ["a null character reference", "&#0;<x>{0}</x>"],
  ])("rejects %s", (_case, text) => {
    expect(decodeMaskedFromXml(text)).toBeUndefined();
  });
});

describe("encodeMaskedForHtml", () => {
  it("wraps each marker in a translate=no span and escapes the residual text", () => {
    expect(encodeMaskedForHtml({ text: "A & {0} > B", originals: ["%s"] })).toBe(
      'A &amp; <span translate="no">{0}</span> &gt; B',
    );
  });

  it.each([
    ["a line feed", "Line {0}\nnext"],
    ["a carriage return", "Line {0}\rnext"],
    ["a tab", "Col {0}\tnext"],
    ["a double space", "Wide {0}  gap"],
  ])("declines a value with %s, which HTML would collapse", (_case, text) => {
    expect(encodeMaskedForHtml({ text, originals: ["%s"] })).toBeUndefined();
  });
});

describe("decodeMaskedFromHtml", () => {
  it("unwraps a span that carries attributes the service added", () => {
    expect(
      decodeMaskedFromHtml(
        '<span translate="no" dir="rtl" style="text-align:right">{0}</span> &#39;x&#39;',
      ),
    ).toBe("{0} 'x'");
  });

  it.each([
    ["a bare marker", "Hallo {0}"],
    ["an unknown entity", 'Hallo&nbsp;<span translate="no">{0}</span>'],
    ["a stray tag", "<div>Hallo</div><span>{0}</span>"],
  ])("rejects %s", (_case, text) => {
    expect(decodeMaskedFromHtml(text)).toBeUndefined();
  });
});

describe("restoreTranslations", () => {
  const plain = entry("plain", "Save");
  const bearing = entry("bearing", "Hi {name}", ["{name}"]);
  const masked = { text: "Hi {0}", originals: ["{name}"] };

  it("restores masked values through the decoder and passes plain values through", () => {
    const restored = restoreTranslations(
      [
        [{ entry: plain, text: "Save" }, "Speichern"],
        [{ entry: bearing, text: "Hi <x>{0}</x>", masked }, "Hallo <x>{0}</x>"],
      ],
      decodeMaskedFromXml,
    );
    expect([...restored.values]).toEqual([
      ["plain", "Speichern"],
      ["bearing", "Hallo {name}"],
    ]);
    expect(restored.translated).toEqual([plain, bearing]);
    expect(restored.lost).toBe(0);
  });

  it("counts a value the decoder rejects as lost", () => {
    const restored = restoreTranslations(
      [[{ entry: bearing, text: "Hi <x>{0}</x>", masked }, "Hallo {0}"]],
      decodeMaskedFromXml,
    );
    expect(restored.values.size).toBe(0);
    expect(restored.integrityInputs).toEqual([]);
    expect(restored.lost).toBe(1);
  });
});
