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
    ["a zero-padded width placeholder", "x %05d y", "%05d"],
    ["a flagged precision placeholder", "x %-+#8.2f y", "%-+#8.2f"],
    ["an opening markup tag", "x <b> y", "<b>"],
    ["a closing markup tag", "x </b> y", "</b>"],
    ["a self-closing tag with attributes", 'x <br class="a"/> y', '<br class="a"/>'],
    ["a numbered component tag", "x <0>y</0>", "<0>"],
  ])("isolates %s as one token", (_label, value, expected) => {
    expect(tokens(value)).toContain(expected);
  });

  it("isolates only the ICU plural syntax and keeps each arm body as direction-following text", () => {
    const value = "لديك {count, plural, one {# عنصر} other {# عناصر}}";
    const segments = segmentValue(value);

    expect(segments).toEqual([
      { kind: "text", text: "لديك " },
      { kind: "token", text: "{count, plural," },
      { kind: "text", text: " " },
      { kind: "token", text: "one {" },
      { kind: "token", text: "#" },
      { kind: "text", text: " عنصر" },
      { kind: "token", text: "} other {" },
      { kind: "token", text: "#" },
      { kind: "text", text: " عناصر" },
      { kind: "token", text: "}" },
      { kind: "token", text: "}" },
    ]);
    expect(segments.map((segment) => segment.text).join("")).toBe(value);
  });

  it("isolates a select head and its selectors, leaving # inside a select arm as text", () => {
    expect(segmentValue("{gender, select, female {هي #} other {هو}}")).toEqual([
      { kind: "token", text: "{gender, select," },
      { kind: "text", text: " " },
      { kind: "token", text: "female {" },
      { kind: "text", text: "هي #" },
      { kind: "token", text: "} other {" },
      { kind: "text", text: "هو" },
      { kind: "token", text: "}" },
      { kind: "token", text: "}" },
    ]);
  });

  it("keeps an offset and exact-value selectors in the ICU syntax tokens", () => {
    expect(tokens("{n, plural, offset:1 =0 {هیڅ} other {# نور}}")).toEqual([
      "{n, plural, offset:1",
      "=0 {",
      "} other {",
      "#",
      "}",
      "}",
    ]);
  });

  it("recurses into arm bodies, tokenizing nested placeholders, nested ICU and markup", () => {
    const value =
      "{count, plural, one {<b>{days}</b> ورځ} other {{gender, select, male {# د {name}} other {#}}}}";
    const segments = segmentValue(value);

    expect(segments.map((segment) => segment.text).join("")).toBe(value);
    expect(tokens(value)).toEqual([
      "{count, plural,",
      "one {",
      "<b>",
      "{days}",
      "</b>",
      "} other {",
      "{gender, select,",
      "male {",
      "#",
      "{name}",
      "} other {",
      "#",
      "}",
      "}",
      "}",
      "}",
    ]);
    expect(segments).toContainEqual({ kind: "text", text: " ورځ" });
    expect(segments).toContainEqual({ kind: "text", text: " د " });
  });

  it.each([
    ["a quoted opening brace", "{n, plural, other {'{' عدد}}", "'{' عدد"],
    ["a quoted run with an escaped apostrophe", "{n, plural, other {'{it''s}' #}}", "'{it''s}' "],
    ["a doubled apostrophe", "{n, plural, other {l''# x}}", "l''"],
    ["a lone apostrophe", "{n, plural, other {l'x}}", "l'x"],
  ])("keeps %s inside an arm as text", (_label, value, text) => {
    const segments = segmentValue(value);

    expect(segments).toContainEqual({ kind: "text", text });
    expect(segments.map((segment) => segment.text).join("")).toBe(value);
  });

  it("keeps sigil, printf and markup placeholders inside a select arm as tokens", () => {
    expect(tokens("{g, select, other {a %{x} b %1$s <i>c</i> @{y}}}")).toEqual([
      "{g, select,",
      "other {",
      "%{x}",
      "%1$s",
      "<i>",
      "</i>",
      "@{y}",
      "}",
      "}",
    ]);
  });

  it.each([
    ["an unclosed ICU message", "x {n, plural, one {a} other {b}", ["{a}", "{b}"]],
    ["an arm without braces", "{n, plural, one a}", ["{n, plural, one a}"]],
    ["an ICU message without arms", "{n, plural, }", ["{n, plural, }"]],
    ["a double brace inside an arm", "{n, plural, other {{{x}}}}", ["{n, plural, other {{{x}}}}"]],
    ["an unterminated quote inside an arm", "{n, plural, other {'{}}", ["{'{}}"]],
    ["an unclosed simple placeholder inside an arm", "{n, plural, other {{x", []],
    [
      "a stray sigil brace inside an arm",
      "{n, select, other {@{a{b}}}}",
      ["{n, select, other {@{a{b}}}}"],
    ],
  ])("falls back to the plain placeholder rules for %s", (_label, value, expected) => {
    const segments = segmentValue(value);

    expect(tokens(value)).toEqual(expected);
    expect(segments.map((segment) => segment.text).join("")).toBe(value);
  });

  it.each([
    ["unclosed ICU heads", "{a, plural, one {".repeat(20_000)],
    ["unbalanced opening braces", "{ ".repeat(50_000)],
    ["unterminated quotes", `{n, plural, other {${"'{".repeat(50_000)}`],
    ["an unmatched opening brace flood", "{".repeat(100_000)],
    ["an unmatched sigil brace flood", "#{".repeat(50_000)],
    ["a printf zero-flag flood", `%${"0".repeat(100_000)}`],
    ["a positional printf digit flood", `%${"1".repeat(100_000)}`],
    ["nested simple placeholders", `{n, plural, other {${"{x}".repeat(50_000)}}}`],
  ])("segments %s in linear time", (_label, value) => {
    const started = performance.now();
    const segments = segmentValue(value);

    expect(segments.map((segment) => segment.text).join("")).toBe(value);
    expect(performance.now() - started).toBeLessThan(1_000);
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

describe("segmentValue: printf parity with the core placeholder pattern", () => {
  it.each([
    ["positional printf", "Hello, %1$s! You have %2$d messages.", ["%1$s", "%2$d"]],
    ["apple printf", "Welcome back, %@", ["%@"]],
    ["a char-length integer", "x %hhd y", ["%hhd"]],
    ["a short integer", "x %hd y", ["%hd"]],
    ["a size_t integer", "x %zu y", ["%zu"]],
    ["an intmax_t integer", "x %jd y", ["%jd"]],
    ["a ptrdiff_t integer", "x %td y", ["%td"]],
    ["a quad integer", "x %qd y", ["%qd"]],
    ["a long double", "x %Lf y", ["%Lf"]],
    ["a long long integer", "x %lld y", ["%lld"]],
    ["a pointer", "x %p y", ["%p"]],
    ["a positional zero-padded float", "x %1$08.3f y", ["%1$08.3f"]],
  ])("isolates %s exactly as core protects it", (_label, value, expected) => {
    expect(tokens(value)).toEqual(expected);
  });
});
