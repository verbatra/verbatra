// biome-ignore-all lint/suspicious/noTemplateCurlyInString: the fixtures are source text under test, not templates
import { describe, expect, it } from "vitest";
import { tokenizeSource } from "./tokenize.js";

function kinds(text: string): readonly string[] {
  return tokenizeSource(text).map((token) => token.kind);
}

function strings(text: string): readonly string[] {
  return tokenizeSource(text)
    .filter((token) => token.kind === "string")
    .map((token) => token.value);
}

describe("tokenizeSource", () => {
  it("splits identifiers, punctuation, and a double-quoted string", () => {
    expect(tokenizeSource('t("greeting")')).toEqual([
      { kind: "ident", value: "t", line: 1 },
      { kind: "punct", value: "(", line: 1 },
      { kind: "string", value: "greeting", line: 1 },
      { kind: "punct", value: ")", line: 1 },
    ]);
  });

  it("reads a single-quoted string", () => {
    expect(strings("t('greeting')")).toEqual(["greeting"]);
  });

  it("resolves escape sequences inside a string", () => {
    expect(strings('x = "a\\nb\\tc\\\\d\\"e\\u0041\\x42\\u{1F600}"')).toEqual([
      'a\nb\tc\\d"eAB\u{1F600}',
    ]);
  });

  it("keeps an unknown escape as the escaped character itself", () => {
    expect(strings('x = "a\\qb"')).toEqual(["aqb"]);
  });

  it("drops a line comment without losing the code after it", () => {
    expect(kinds('// t("ignored")\nt("kept")')).toEqual(["ident", "punct", "string", "punct"]);
    expect(strings('// t("ignored")\nt("kept")')).toEqual(["kept"]);
  });

  it("drops a block comment spanning lines and keeps the line count", () => {
    const tokens = tokenizeSource('/* t("ignored")\n   still ignored */\nt("kept")');

    expect(tokens.map((token) => token.line)).toEqual([3, 3, 3, 3]);
    expect(strings('/* t("ignored")\n   still ignored */\nt("kept")')).toEqual(["kept"]);
  });

  it("reads a template literal with no expression as a static string", () => {
    expect(strings("t(`greeting`)")).toEqual(["greeting"]);
  });

  it("reports a template literal carrying an expression as dynamic", () => {
    expect(kinds("t(`greeting.${name}`)")).toContain("dynamic");
  });

  it("still finds a call written inside a template expression", () => {
    expect(strings('x = `${t("inner")}`')).toEqual(["inner"]);
  });

  it("does not read a regex literal as a string or as division", () => {
    expect(strings('const r = /"not a key"/g;\nt("kept")')).toEqual(["kept"]);
  });

  it("treats a slash after a value as division rather than a regex start", () => {
    expect(kinds("a / b / c")).toEqual(["ident", "punct", "ident", "punct", "ident"]);
  });

  it("counts lines across string and template newlines", () => {
    const tokens = tokenizeSource("a\n`x\ny`\nb");

    expect(tokens.map((token) => ({ kind: token.kind, line: token.line }))).toEqual([
      { kind: "ident", line: 1 },
      { kind: "string", line: 2 },
      { kind: "ident", line: 4 },
    ]);
  });

  it("reports an unterminated string as dynamic rather than throwing", () => {
    expect(kinds('t("unterminated')).toEqual(["ident", "punct", "dynamic"]);
  });

  it("ignores an unterminated block comment to the end of the file", () => {
    expect(kinds('a /* t("x")')).toEqual(["ident"]);
  });

  it("keeps numbers and other atoms out of the way as punctuation-free idents", () => {
    expect(kinds("x = 42")).toEqual(["ident", "punct", "ident"]);
  });
});

describe("tokenizeSource inside template expressions", () => {
  it("does not end the expression on a brace that sits inside a string", () => {
    expect(strings('`${ t("}") }`')).toEqual(["}"]);
  });

  it("re-reads a template nested inside an expression", () => {
    expect(strings('`${ `${ t("deep") }` }`')).toEqual(["deep"]);
  });

  it("skips a line comment inside an expression", () => {
    expect(strings('`${ // }\nt("kept") }`')).toEqual(["kept"]);
  });

  it("skips a block comment inside an expression", () => {
    expect(strings('`${ /* } */ t("kept") }`')).toEqual(["kept"]);
  });

  it("reports an unterminated template as dynamic and still reads its expression", () => {
    expect(kinds("`unterminated ${x}")).toEqual(["dynamic", "ident"]);
  });

  it("emits no static string for an unterminated template", () => {
    expect(strings("`unterminated")).toEqual([]);
  });
});

describe("tokenizeSource on awkward slashes and escapes", () => {
  it("falls back to punctuation when a slash never closes", () => {
    expect(kinds("x = /unterminated")).toEqual(["ident", "punct", "punct", "ident"]);
  });

  it("reads a slash inside a character class without closing the regex", () => {
    expect(strings('const r = /[/"]/;\nt("kept")')).toEqual(["kept"]);
  });

  it("treats a slash after a closing parenthesis as division", () => {
    expect(kinds("f() / 2")).toEqual(["ident", "punct", "punct", "punct", "ident"]);
  });

  it("allows a regex directly after a keyword", () => {
    expect(strings('return /"x"/;\nt("kept")')).toEqual(["kept"]);
  });

  it("drops an unterminated unicode escape rather than throwing", () => {
    expect(strings('"a\\u{41"')).toEqual(["a{41"]);
  });

  it("keeps a line continuation out of the string value", () => {
    expect(strings('"a\\\nb"')).toEqual(["ab"]);
  });

  it("skips an escaped quote when scanning past a string inside an expression", () => {
    expect(strings('`${ "a\\"}b" + t("kept") }`')).toEqual(['a"}b', "kept"]);
  });

  it("stops scanning a raw string at a newline inside an expression", () => {
    expect(kinds('`${ "a\n }`')).toEqual(["dynamic", "dynamic"]);
  });

  it("skips an escaped backtick inside a nested raw template", () => {
    expect(strings('`${ `a\\`b` + t("kept") }`')).toEqual(["a`b", "kept"]);
  });
});

describe("tokenizeSource on malformed unicode escapes", () => {
  it("does not swallow the rest of the file looking for a closing brace", () => {
    expect(strings('"a\\u{41" + t("kept");')).toEqual(["a{41", "kept"]);
  });

  it("does not throw on a code point that is not hexadecimal", () => {
    expect(strings('"a\\u{zz}b"')).toEqual(["a{zz}b"]);
  });

  it("does not throw on a code point above the unicode range", () => {
    expect(() => tokenizeSource('"\\u{FFFFFFF}"')).not.toThrow();
  });
});
