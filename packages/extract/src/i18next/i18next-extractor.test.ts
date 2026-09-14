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
});

describe("createI18nextExtractor on a key argument that is not a complete literal", () => {
  it("reports a concatenated key as dynamic rather than writing its first fragment", () => {
    expect(calls('t("user." + id)')).toEqual([]);
    expect(dynamic('t("user." + id)')).toEqual([{ line: 1 }]);
  });

  it("reports a concatenated positional default as no default rather than its first fragment", () => {
    expect(calls('t("nav.home", "Default" + suffix)')).toEqual([{ key: "nav.home", line: 1 }]);
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
});

describe("createI18nextExtractor on optional-call syntax", () => {
  it("reads a key through an optional call", () => {
    expect(calls('t?.("nav.home", "Home")')).toEqual([
      { key: "nav.home", defaultValue: "Home", line: 1 },
    ]);
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
