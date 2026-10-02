// biome-ignore-all lint/suspicious/noTemplateCurlyInString: the fixtures are placeholder text under test, not templates
import { describe, expect, it } from "vitest";
import {
  foreignPlaceholderTokens,
  missingForeignPlaceholders,
  PLACEHOLDER_SYNTAXES,
  type PlaceholderSyntax,
} from "./foreign-tokens.js";

const NONE: readonly PlaceholderSyntax[] = [];

function allExcept(syntax: PlaceholderSyntax): readonly PlaceholderSyntax[] {
  return PLACEHOLDER_SYNTAXES.filter((member) => member !== syntax);
}

describe("foreignPlaceholderTokens", () => {
  it.each<[PlaceholderSyntax, string, readonly string[]]>([
    [
      "double-brace",
      "Hello {{name}}, {{ user.name }} and {{- raw}}",
      ["{{name}}", "{{ user.name }}", "{{- raw}}"],
    ],
    ["double-brace", "Total {{amount, currency(USD)}}", ["{{amount, currency(USD)}}"]],
    ["single-brace", "Hello {name}, file {0}", ["{name}", "{0}"]],
    ["single-brace", "{count, plural, one {# item} other {# items}}", ["{count, plural,"]],
    ["single-brace", "{count, plural, one {item} other {items}}", ["{count, plural,"]],
    [
      "single-brace",
      "{gender, select, male {He} female {She} other {They}} left",
      ["{gender, select,"],
    ],
    [
      "single-brace",
      "{g, select, male {{n, plural, one {his {n} item} other {his items}}} other {theirs}} {x}",
      ["{g, select,", "{x}"],
    ],
    ["single-brace", "Broken {n, plural, one {item", ["{n, plural,"]],
    ["single-brace", "On {day, date}", ["{day, date}"]],
    ["printf", "%s of %d, %@ and %1$s", ["%s", "%d", "%@", "%1$s"]],
    ["printf", "Ratio %.2f, size %zu", ["%.2f", "%zu"]],
    ["python-named", "Hi %(user)s, you have %(count)d", ["%(user)s", "%(count)d"]],
    ["ruby", "%{count} items", ["%{count}"]],
    ["dollar-brace", "Hello ${name}", ["${name}"]],
  ])("reports %s tokens when the syntax is foreign: %s", (syntax, value, expected) => {
    expect(foreignPlaceholderTokens(value, allExcept(syntax))).toEqual(expected);
  });

  it.each<[PlaceholderSyntax, string]>([
    ["double-brace", "Hello {{name}}"],
    ["single-brace", "Hello {name}"],
    ["printf", "Hello %s"],
    ["python-named", "Hello %(name)s"],
    ["ruby", "Hello %{name}"],
    ["dollar-brace", "Hello ${name}"],
  ])("never reports a %s token when the syntax is native: %s", (syntax, value) => {
    expect(foreignPlaceholderTokens(value, [syntax])).toEqual([]);
  });

  it.each([
    ["{{a}}", "double-brace"],
    ["%{a}", "ruby"],
    ["${a}", "dollar-brace"],
  ] as const)("matches %s as a whole and never also yields {a}", (value, syntax) => {
    expect(foreignPlaceholderTokens(value, NONE)).toEqual([value]);
    expect(foreignPlaceholderTokens(value, [syntax])).toEqual([]);
  });

  it.each<[PlaceholderSyntax, string, readonly string[]]>([
    ["single-brace", "Hallo {名前}, Datei {٣}", ["{名前}", "{٣}"]],
    ["single-brace", "{नाम} und {café_2}", ["{नाम}", "{café_2}"]],
    ["single-brace", "{件数, plural, one {# 件} other {# 件}}", ["{件数, plural,"]],
    [
      "double-brace",
      "Hallo {{名前}} und {{ użytkownik.imię }}",
      ["{{名前}}", "{{ użytkownik.imię }}"],
    ],
    ["ruby", "%{件数} Artikel", ["%{件数}"]],
    ["dollar-brace", "Hallo ${名前}", ["${名前}"]],
  ])(
    "reports a %s token whose name uses non-ASCII letters or digits: %s",
    (syntax, value, expected) => {
      expect(foreignPlaceholderTokens(value, allExcept(syntax))).toEqual(expected);
      expect(foreignPlaceholderTokens(value, [syntax])).toEqual([]);
    },
  );

  it.each(["{名 前}", "{·名}", "{̈a}", "{a½}", "%名"])(
    "keeps a non-ASCII run that is no identifier quiet: %s",
    (value) => {
      expect(foreignPlaceholderTokens(value, NONE)).toEqual([]);
    },
  );

  it("keeps python-named names ASCII-only, so %(名前)s stays quiet", () => {
    expect(foreignPlaceholderTokens("Hi %(名前)s", NONE)).toEqual([]);
  });

  it("does not read %(name)s as a printf token", () => {
    expect(foreignPlaceholderTokens("Hi %(name)s", ["python-named"])).toEqual([]);
  });

  it("skips an escaped percent sign", () => {
    expect(foreignPlaceholderTokens("100%% done", NONE)).toEqual([]);
    expect(foreignPlaceholderTokens("100%%s", NONE)).toEqual([]);
  });

  it.each([
    "50%off",
    "100 % sure",
    "{ note }",
    "a {b c} d",
    'Use {"key": 1} here',
    "{ see note }",
    "{}",
    "Cost: $5",
    "plain prose without any token",
    "50 %off today",
    "Use %D for the day",
    "It%E2%80%99s",
    "x=%E2%80%99",
    "a%20b",
    "q=%2F",
    "%2d",
    "Visit https://example.com/a%20b/%s?x=%2F&y={id} now",
    "%(name)sfoo",
    "%sMB",
    "",
  ])("stays quiet on prose: %s", (value) => {
    expect(foreignPlaceholderTokens(value, NONE)).toEqual([]);
  });

  it("still reports a printf token next to punctuation", () => {
    expect(foreignPlaceholderTokens("(%s), %d. %02d%%", NONE)).toEqual(["%s", "%d", "%02d"]);
  });

  it("reports an ICU argument once, by its head, however its arms are translated", () => {
    const tokens = (value: string) => foreignPlaceholderTokens(value, ["double-brace"]);
    expect(tokens("{n, plural, one {# Artikel} other {# Artikel}}")).toEqual(["{n, plural,"]);
  });

  it("keeps every occurrence in order", () => {
    expect(foreignPlaceholderTokens("{a} and {b} and {a}", NONE)).toEqual(["{a}", "{b}", "{a}"]);
  });

  it("reports nothing when every syntax is native, for a mix of every family", () => {
    const value = "{{a}} {b} %s %(c)s %{d} ${e} {n, plural, one {#} other {#}}";
    expect(foreignPlaceholderTokens(value, PLACEHOLDER_SYNTAXES)).toEqual([]);
  });
});

describe("missingForeignPlaceholders", () => {
  it("names a foreign token the target dropped", () => {
    expect(
      missingForeignPlaceholders("Hello {name}, welcome back!", "Hallo, willkommen zurück!", [
        "double-brace",
      ]),
    ).toEqual(["{name}"]);
  });

  it("names a foreign token the target rewrote", () => {
    expect(missingForeignPlaceholders("Hello {name}", "Hallo {Name}", ["double-brace"])).toEqual([
      "{name}",
    ]);
  });

  it("names each missing occurrence of a repeated token", () => {
    expect(missingForeignPlaceholders("{a} or {a}", "{a} oder", NONE)).toEqual(["{a}"]);
    expect(missingForeignPlaceholders("{a} or {a}", "oder", NONE)).toEqual(["{a}", "{a}"]);
  });

  it("is quiet when the target keeps every foreign token, in any order", () => {
    expect(missingForeignPlaceholders("{a} then {b}", "{b} dann {a}", NONE)).toEqual([]);
  });

  it("is quiet when the target only adds a token", () => {
    expect(missingForeignPlaceholders("Hello", "Hallo {name}", NONE)).toEqual([]);
  });

  it("does not count a {a} inside a target {{a}} as kept", () => {
    expect(missingForeignPlaceholders("Hi {a}", "Hallo {{a}}", ["double-brace"])).toEqual(["{a}"]);
  });

  it("ignores native tokens the target dropped", () => {
    expect(missingForeignPlaceholders("Hello {{name}}", "Hallo", ["double-brace"])).toEqual([]);
  });
});
