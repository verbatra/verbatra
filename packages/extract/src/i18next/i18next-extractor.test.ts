// biome-ignore-all lint/suspicious/noTemplateCurlyInString: the fixtures are source text under test, not templates
import { describe, expect, it } from "vitest";
import { createI18nextExtractor } from "./i18next-extractor.js";

const extractor = createI18nextExtractor();

function calls(content: string) {
  return extractor.extract({ path: "app.ts", content }).calls;
}

function dynamic(content: string) {
  return extractor.extract({ path: "app.ts", content }).dynamic;
}

describe("createI18nextExtractor", () => {
  it("names the framework it implements", () => {
    expect(extractor.framework).toBe("i18next");
  });

  it("handles the JavaScript and TypeScript source extensions", () => {
    expect(extractor.extensions).toContain(".tsx");
    expect(extractor.extensions).toContain(".mjs");
  });

  it("finds a bare t call and records its line", () => {
    expect(calls('\nconst label = t("nav.home");')).toEqual([{ key: "nav.home", line: 2 }]);
  });

  it("finds a dollar-prefixed t call", () => {
    expect(calls('$t("nav.home")')).toEqual([{ key: "nav.home", line: 1 }]);
  });

  it("finds a member-call t through any receiver", () => {
    expect(calls('i18n.t("nav.home");\ni18next.t("nav.away")')).toEqual([
      { key: "nav.home", line: 1 },
      { key: "nav.away", line: 2 },
    ]);
  });

  it("reads a positional default value", () => {
    expect(calls('t("nav.home", "Home")')).toEqual([
      { key: "nav.home", defaultValue: "Home", line: 1 },
    ]);
  });

  it("reads a defaultValue from the options object", () => {
    expect(calls('t("nav.home", { count: 2, defaultValue: "Home" })')).toEqual([
      { key: "nav.home", defaultValue: "Home", line: 1 },
    ]);
  });

  it("leaves the default value unset when the options object carries none", () => {
    expect(calls('t("nav.home", { count: 2 })')).toEqual([{ key: "nav.home", line: 1 }]);
  });

  it("does not read a defaultValue out of a nested object", () => {
    expect(calls('t("nav.home", { nested: { defaultValue: "Wrong" } })')).toEqual([
      { key: "nav.home", line: 1 },
    ]);
  });

  it("reports a variable key as dynamic rather than guessing at it", () => {
    expect(calls("t(key)")).toEqual([]);
    expect(dynamic("t(key)")).toEqual([{ line: 1 }]);
  });

  it("reports a template key carrying an expression as dynamic", () => {
    expect(dynamic("t(`nav.${section}`)")).toEqual([{ line: 1 }]);
  });

  it("reads a template key with no expression as a static key", () => {
    expect(calls("t(`nav.home`)")).toEqual([{ key: "nav.home", line: 1 }]);
  });

  it("ignores a call site inside a comment", () => {
    expect(calls('// t("nav.home")')).toEqual([]);
  });

  it("ignores a function declaration named t", () => {
    expect(dynamic("function t(key) { return key; }")).toEqual([]);
  });

  it("ignores an empty key", () => {
    expect(calls('t("")')).toEqual([]);
    expect(dynamic('t("")')).toEqual([]);
  });

  it("ignores a call with no arguments at all", () => {
    expect(calls("t()")).toEqual([]);
    expect(dynamic("t()")).toEqual([]);
  });

  it("finds every call site in one file", () => {
    const content = [
      'import { useTranslation } from "react-i18next";',
      "export function Nav() {",
      "  const { t } = useTranslation();",
      '  return [t("nav.home", "Home"), t("nav.away")];',
      "}",
    ].join("\n");

    expect(calls(content)).toEqual([
      { key: "nav.home", defaultValue: "Home", line: 4 },
      { key: "nav.away", line: 4 },
    ]);
  });
});

describe("createI18nextExtractor on malformed option objects", () => {
  it("leaves the default unset when an unclosed options object carries none", () => {
    expect(calls('t("nav.home", { count: 1')).toEqual([{ key: "nav.home", line: 1 }]);
  });

  it("still reads a defaultValue out of an options object that is never closed", () => {
    expect(calls('t("nav.home", { defaultValue: "Home"')).toEqual([
      { key: "nav.home", defaultValue: "Home", line: 1 },
    ]);
  });

  it("ignores a defaultValue whose value is not a string literal", () => {
    expect(calls('t("nav.home", { defaultValue: fallback })')).toEqual([
      { key: "nav.home", line: 1 },
    ]);
  });

  it("ignores a second argument that is neither a string nor an object", () => {
    expect(calls('t("nav.home", fallback)')).toEqual([{ key: "nav.home", line: 1 }]);
  });

  it("reads an unclosed argument list as a call rather than a declaration", () => {
    expect(dynamic("const api = { t(key")).toEqual([{ line: 1 }]);
  });
});

describe("createI18nextExtractor on a key argument that is not a complete literal", () => {
  it("reports a concatenated key as dynamic rather than writing its first fragment", () => {
    expect(calls('t("user." + id)')).toEqual([]);
    expect(dynamic('t("user." + id)')).toEqual([{ line: 1 }]);
  });

  it("reports a concatenated positional default as no default rather than its first fragment", () => {
    expect(calls('t("nav.home", "Default" + suffix)')).toEqual([{ key: "nav.home", line: 1 }]);
  });

  it("reports a concatenated options default as no default rather than its first fragment", () => {
    expect(calls('t("nav.home", { defaultValue: "Home" + suffix })')).toEqual([
      { key: "nav.home", line: 1 },
    ]);
  });

  it("reads no default from an options default that is a template carrying an expression", () => {
    expect(calls('t("nav.home", { defaultValue: `Hi ${name}` })')).toEqual([
      { key: "nav.home", line: 1 },
    ]);
  });

  it("reports an i18next namespace-qualified key as dynamic, since one config addresses one file", () => {
    expect(calls('t("common:nav.home", "Home")')).toEqual([]);
    expect(dynamic('t("common:nav.home", "Home")')).toEqual([{ line: 1 }]);
  });

  it("still reads a key followed by a closing parenthesis or a comma", () => {
    expect(calls('t("a");\nt("b", "B");')).toEqual([
      { key: "a", line: 1 },
      { key: "b", defaultValue: "B", line: 2 },
    ]);
  });
});

describe("createI18nextExtractor on shapes that could defeat the completeness check", () => {
  it("reads a key that a block comment separates from its comma", () => {
    expect(calls('t("nav.home" /* the key */, "Home")')).toEqual([
      { key: "nav.home", defaultValue: "Home", line: 1 },
    ]);
  });

  it("reports a key that a block comment separates from a concatenation as dynamic", () => {
    expect(calls('t("user." /* joined below */ + id)')).toEqual([]);
    expect(dynamic('t("user." /* joined below */ + id)')).toEqual([{ line: 1 }]);
  });

  it("reads a key whose comma sits on the next line", () => {
    expect(calls('t("nav.home"\n  , "Home")')).toEqual([
      { key: "nav.home", defaultValue: "Home", line: 1 },
    ]);
  });

  it("reads a key whose comma sits after a carriage return", () => {
    expect(calls('t("nav.home"\r\n  , "Home")')).toEqual([
      { key: "nav.home", defaultValue: "Home", line: 1 },
    ]);
  });

  it("reads a key followed by a trailing comma and records no default", () => {
    expect(calls('t("nav.home",)')).toEqual([{ key: "nav.home", line: 1 }]);
  });

  it("reports a ternary key as dynamic rather than taking either branch", () => {
    expect(calls('t(open ? "nav.home" : "nav.away")')).toEqual([]);
    expect(dynamic('t(open ? "nav.home" : "nav.away")')).toEqual([{ line: 1 }]);
  });

  it("reports a key produced by a nested call as dynamic rather than its inner literal", () => {
    expect(calls('t(prefixed("nav.home"))')).toEqual([]);
    expect(dynamic('t(prefixed("nav.home"))')).toEqual([{ line: 1 }]);
  });

  it("reports a parenthesised key as dynamic rather than unwrapping it", () => {
    expect(calls('t(("nav.home"))')).toEqual([]);
    expect(dynamic('t(("nav.home"))')).toEqual([{ line: 1 }]);
  });

  it("reports a key narrowed by a type assertion as dynamic", () => {
    expect(calls('t("nav.home" as const)')).toEqual([]);
    expect(dynamic('t("nav.home" as const)')).toEqual([{ line: 1 }]);
  });

  it("reports a concatenation whose literal comes second as dynamic", () => {
    expect(calls('t(prefix + "nav.home")')).toEqual([]);
    expect(dynamic('t(prefix + "nav.home")')).toEqual([{ line: 1 }]);
  });

  it("reports a key whose string literal is never terminated as dynamic", () => {
    expect(calls('t("nav.home')).toEqual([]);
    expect(dynamic('t("nav.home')).toEqual([{ line: 1 }]);
  });

  it("accepts a whole key that the end of the token stream terminates", () => {
    expect(calls('t("nav.home"')).toEqual([{ key: "nav.home", line: 1 }]);
  });

  it("reports a key carrying the namespace separator twice as dynamic", () => {
    expect(calls('t("common:nav:home")')).toEqual([]);
    expect(dynamic('t("common:nav:home")')).toEqual([{ line: 1 }]);
  });

  it("resolves a unicode escape inside a key before recording it", () => {
    expect(calls('t("nav.\\u0068ome")')).toEqual([{ key: "nav.home", line: 1 }]);
    expect(calls('t("nav.\\u{1F600}")')).toEqual([{ key: "nav.\u{1F600}", line: 1 }]);
  });

  it("records neither the key nor a dynamic site for an empty key", () => {
    expect(calls('t("")')).toEqual([]);
    expect(dynamic('t("")')).toEqual([]);
  });

  it("reads no default from a positional template default carrying an expression", () => {
    expect(calls('t("nav.home", `Hi ${name}`)')).toEqual([{ key: "nav.home", line: 1 }]);
  });

  it("reads a positional template default that carries no expression", () => {
    expect(calls('t("nav.home", `Home`)')).toEqual([
      { key: "nav.home", defaultValue: "Home", line: 1 },
    ]);
  });

  it("reads no default from an options default that is an arrow function", () => {
    expect(calls('t("nav.home", () => "Home")')).toEqual([{ key: "nav.home", line: 1 }]);
  });

  it("keeps reading the file after a call site it could not resolve whole", () => {
    const content = 't("nav.home", "Home");\nt("user." + id);\nt("nav.away", "Away");';

    expect(calls(content)).toEqual([
      { key: "nav.home", defaultValue: "Home", line: 1 },
      { key: "nav.away", defaultValue: "Away", line: 3 },
    ]);
    expect(dynamic(content)).toEqual([{ line: 2 }]);
  });

  it.each([
    ['const url = "http://example.com";', 2],
    ["const pattern = /[/]/;", 2],
    ["const ratio = a / b;", 2],
    ["// an apostrophe isn't a quote", 2],
    ['const brace = { "}": 1 };', 2],
  ])("still reports a concatenated key as dynamic after %s", (preamble, line) => {
    const content = `${preamble}\nt("user." + id);`;

    expect(calls(content)).toEqual([]);
    expect(dynamic(content)).toEqual([{ line }]);
  });
});

describe("createI18nextExtractor on a whole key with no usable structure", () => {
  it.each(["user.", ".lead", "a..b", ".", "..."])(
    "reports %s as dynamic rather than writing an empty path segment",
    (key) => {
      const content = `t(${JSON.stringify(key)})`;

      expect(calls(content)).toEqual([]);
      expect(dynamic(content)).toEqual([{ line: 1 }]);
    },
  );

  it("still reads a key whose segments are all non-empty", () => {
    expect(calls('t("a.b.c")')).toEqual([{ key: "a.b.c", line: 1 }]);
  });

  it("reports an empty segment before reading the default, so nothing is half-written", () => {
    expect(calls('t("user.", "User")')).toEqual([]);
    expect(dynamic('t("user.", "User")')).toEqual([{ line: 1 }]);
  });

  it("reads a default value that carries a dot at either end", () => {
    expect(calls('t("nav.home", "Home.")')).toEqual([
      { key: "nav.home", defaultValue: "Home.", line: 1 },
    ]);
  });
});

describe("createI18nextExtractor on a file it cannot read to the end", () => {
  it("marks an unterminated block comment as truncated and keeps what it read", () => {
    const content = 't("nav.home", "Home");\nt("nav.away"); /* never closed\nt("nav.lost");';
    const extraction = extractor.extract({ path: "app.ts", content });

    expect(extraction.truncated).toBe(true);
    expect(extraction.calls).toEqual([
      { key: "nav.home", defaultValue: "Home", line: 1 },
      { key: "nav.away", line: 2 },
    ]);
  });

  it("marks an unterminated template literal as truncated", () => {
    expect(extractor.extract({ path: "app.ts", content: "const a = `open;" }).truncated).toBe(true);
  });

  it("leaves truncated unset for a file it read whole", () => {
    expect(
      extractor.extract({ path: "app.ts", content: 't("nav.home")' }).truncated,
    ).toBeUndefined();
  });
});

describe("createI18nextExtractor on declarations rather than calls", () => {
  it.each([
    "const api = { t(key) { return key; } };",
    "class Api { t(key) { return key; } }",
    "type F = { t(key: string): string };",
    "interface I { t(k: string): string }",
  ])("ignores %s", (content) => {
    expect(dynamic(content)).toEqual([]);
    expect(calls(content)).toEqual([]);
  });

  it("ignores a member signature whose parameter list carries nested parentheses", () => {
    const content = "const api = { t(key, map(key)) { return key; } };";

    expect(dynamic(content)).toEqual([]);
    expect(calls(content)).toEqual([]);
  });
});

describe("createI18nextExtractor on optional-call syntax", () => {
  it("reads a key through an optional call", () => {
    expect(calls('t?.("nav.home", "Home")')).toEqual([
      { key: "nav.home", defaultValue: "Home", line: 1 },
    ]);
  });
});

describe("createI18nextExtractor on explicit type arguments", () => {
  it("reads a key through a type-argument list", () => {
    expect(calls('t<string>("nav.home", "Home")')).toEqual([
      { key: "nav.home", defaultValue: "Home", line: 1 },
    ]);
  });

  it("reads a key through a type-argument list on an optional call", () => {
    expect(calls('t?.<string>("nav.home")')).toEqual([{ key: "nav.home", line: 1 }]);
  });

  it("reads a key through a nested type-argument list", () => {
    expect(calls('t<Record<string, string>>("nav.home")')).toEqual([{ key: "nav.home", line: 1 }]);
  });

  it("does not read a comparison against a call as a key", () => {
    expect(calls('t < limit("nav.home")')).toEqual([]);
  });
});

describe("createI18nextExtractor on key sites it does not read as calls", () => {
  function indirect(content: string) {
    return extractor.extract({ path: "app.tsx", content }).indirect;
  }

  it("reports a keyPrefix option, since every call it scopes names a different key", () => {
    expect(indirect('const { t } = useTranslation("ns", {\n  keyPrefix: "nav",\n});')).toEqual([
      { line: 2 },
    ]);
  });

  it("reports a Trans component and its i18nKey attribute", () => {
    expect(indirect('<Trans i18nKey="nav.home">Home</Trans>')).toEqual([
      { line: 1 },
      { line: 1 },
      { line: 1 },
    ]);
  });

  it("leaves the field absent when the file has none", () => {
    expect(extractor.extract({ path: "app.ts", content: 't("nav.home")' })).toEqual({
      calls: [{ key: "nav.home", line: 1 }],
      dynamic: [],
    });
  });

  it("ignores the same words inside a string or a comment", () => {
    expect(indirect('// keyPrefix Trans\nconst label = "i18nKey";')).toBeUndefined();
  });
});

describe("createI18nextExtractor on JSX prose", () => {
  it("does not lose a call that follows an apostrophe in JSX text", () => {
    const content = [
      "export function Nav() {",
      "  return (",
      "    <nav>",
      '      <a>{t("nav.home", "Home")}</a>',
      '      <p>We\'re glad {t("nav.hi")}</p>',
      "    </nav>",
      "  );",
      "}",
    ].join("\n");

    expect(calls(content)).toEqual([
      { key: "nav.home", defaultValue: "Home", line: 4 },
      { key: "nav.hi", line: 5 },
    ]);
  });
});
