import { describe, expect, it } from "vitest";
import { segmentValue } from "./value-tokens.js";

function tokens(value: string): readonly string[] {
  return segmentValue(value)
    .filter((segment) => segment.kind === "token")
    .map((segment) => segment.text);
}

describe("segmentValue", () => {
  it("returns no segment for an empty value", () => {
    expect(segmentValue("")).toEqual([]);
  });

  it("keeps a value without any token as one text segment", () => {
    expect(segmentValue("مرحبا بالعالم")).toEqual([{ kind: "text", text: "مرحبا بالعالم" }]);
  });

  it("splits text around a brace placeholder, preserving every character in order", () => {
    const value = "طلب {orderId} جاهز";
    const segments = segmentValue(value);

    expect(segments).toEqual([
      { kind: "text", text: "طلب " },
      { kind: "token", text: "{orderId}" },
      { kind: "text", text: " جاهز" },
    ]);
    expect(segments.map((segment) => segment.text).join("")).toBe(value);
  });

  it.each([
    ["a sigil-prefixed brace placeholder", "رقم #{orderId}", "#{orderId}"],
    ["a percent-sigil brace placeholder", "x %{count} y", "%{count}"],
    ["a double-brace placeholder", "x {{count}} y", "{{count}}"],
    ["a positional printf placeholder", "x %1$s y", "%1$s"],
    ["an Objective-C object placeholder", "x %@ y", "%@"],
    ["a long integer placeholder", "x %lld y", "%lld"],
    ["an opening markup tag", "x <b> y", "<b>"],
    ["a closing markup tag", "x </b> y", "</b>"],
    ["a self-closing tag with attributes", 'x <br class="a"/> y', '<br class="a"/>'],
    ["a numbered component tag", "x <0>y</0>", "<0>"],
  ])("isolates %s as one token", (_label, value, expected) => {
    expect(tokens(value)).toContain(expected);
  });

  it("isolates a whole ICU plural message, nested arms included, as one token", () => {
    const icu = "{count, plural, one {# عنصر} other {# عناصر}}";

    expect(segmentValue(`لديك ${icu}`)).toEqual([
      { kind: "text", text: "لديك " },
      { kind: "token", text: icu },
    ]);
  });

  it("treats an unbalanced brace as plain text", () => {
    expect(segmentValue("a { b")).toEqual([{ kind: "text", text: "a { b" }]);
  });

  it("treats a lone sigil or percent sign as plain text", () => {
    expect(segmentValue("# 50% off")).toEqual([{ kind: "text", text: "# 50% off" }]);
  });

  it("treats a less-than comparison as plain text", () => {
    expect(segmentValue("a < b and c > d")).toEqual([{ kind: "text", text: "a < b and c > d" }]);
  });

  it("emits adjacent tokens without an empty text segment between them", () => {
    expect(segmentValue("<b>{name}</b>")).toEqual([
      { kind: "token", text: "<b>" },
      { kind: "token", text: "{name}" },
      { kind: "token", text: "</b>" },
    ]);
  });
});
