import { describe, expect, it } from "vitest";
import {
  decodeMaskedFromHtml,
  decodeMaskedFromXml,
  encodeMaskedForHtml,
  encodeMaskedForXml,
} from "./masked-wire-codec.js";

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
    ["a malformed decimal reference", "&#12a;<x>{0}</x>"],
    ["a malformed hex reference", "&#xZZ;<x>{0}</x>"],
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

describe("decoding never lets the engine introduce reserved characters", () => {
  it.each([
    ["a hex-encoded script tag", "&#x3C;script&#x3E;"],
    ["a decimal-encoded script tag", "&#60;script&#62;"],
    ["a hex-encoded img tag", "&#x3c;img onerror=x&#x3e;"],
    ["a decimal-encoded img tag", "&#60;img onerror=x&#62;"],
    ["a named-entity tag", "&lt;img&gt;"],
    ["a hex-encoded bare marker", "&#x7B;0&#x7D;"],
    ["a decimal-encoded bare marker", "&#123;0&#125;"],
  ])("rejects %s in XML and HTML output", (_case, injected) => {
    expect(decodeMaskedFromXml(`${injected}<x>{0}</x>`)).toBeUndefined();
    expect(decodeMaskedFromHtml(`${injected}<span translate="no">{0}</span>`)).toBeUndefined();
  });

  it("does not take a span-like custom element for a wrapper", () => {
    expect(decodeMaskedFromHtml("<span-x>{0}</span>")).toBeUndefined();
    expect(decodeMaskedFromHtml("<spanx>{0}</span>")).toBeUndefined();
  });

  it("does not accept a span whose attributes hide an entity or a brace", () => {
    expect(decodeMaskedFromHtml('<span title="&#123;">{0}</span>')).toBeUndefined();
    expect(decodeMaskedFromHtml('<span title="}">{0}</span>')).toBeUndefined();
  });
});
