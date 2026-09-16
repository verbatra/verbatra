import { describe, expect, it } from "vitest";
import { assessValueDegeneracy } from "../validation/value-degeneracy.js";
import { pseudolocalizeValue } from "./pseudo-transform.js";

const ASCII_LETTER = /[A-Za-z]/;

const LONG_SENTENCE =
  "Your account will be permanently deleted after thirty days, and every project, translation " +
  "memory entry and invitation you created is removed from the workspace without further warning.";

describe("pseudolocalizeValue: the visible transform", () => {
  it("accents every ASCII letter of a plain value", () => {
    const result = pseudolocalizeValue("Save");

    expect(ASCII_LETTER.test(result)).toBe(false);
    expect(result).toContain("Śáṽé");
  });

  it("wraps the value in boundary markers so a clipped string is obvious", () => {
    const result = pseudolocalizeValue("Save");

    expect(result.startsWith("[")).toBe(true);
    expect(result.endsWith("]")).toBe(true);
  });

  it("expands the value so a too-narrow layout truncates visibly", () => {
    const source = "Delete this account permanently";

    expect(pseudolocalizeValue(source).length).toBeGreaterThan(source.length * 1.3);
  });

  it("expands well short of doubling, so the result stays readable", () => {
    const source = "Delete this account permanently";

    expect(pseudolocalizeValue(source).length).toBeLessThan(source.length * 1.6);
  });

  it("leaves digits and punctuation alone", () => {
    expect(pseudolocalizeValue("42 items, 7%")).toContain("42 íṫéṁś, 7%");
  });

  it("leaves non-Latin script alone", () => {
    expect(pseudolocalizeValue("こんにちは")).toContain("こんにちは");
  });

  it("produces the same output on every run", () => {
    const source = "One {count} item left";

    expect(pseudolocalizeValue(source)).toBe(pseudolocalizeValue(source));
  });

  it("leaves an empty value empty rather than inventing a marker", () => {
    expect(pseudolocalizeValue("")).toBe("");
  });

  it("marks a whitespace-only value so the empty space is still visible", () => {
    expect(pseudolocalizeValue("   ")).toBe("[   \u00b7\u00b7]");
  });
});

describe("pseudolocalizeValue: placeholders survive unchanged", () => {
  it.each([
    ["double brace", "Hello {{name}}, you have {{count}} items", ["{{name}}", "{{count}}"]],
    ["i18next nesting", 'See $t(common.foo, {"count": 3}) now', ['$t(common.foo, {"count": 3})']],
    ["single brace", "Hello {name}, you have {count} items", ["{name}", "{count}"]],
    ["positional printf", "Hello, %1$s! You have %2$d messages.", ["%1$s", "%2$d"]],
    ["apple printf", "Welcome back, %@", ["%@"]],
    ["apple plural variable", "%#@photos@ in the album", ["%#@photos@"]],
    ["literal percent", "100%% done", ["%%"]],
    ["python-style gettext", "Hello %(name)s, welcome", ["%(name)s"]],
    [
      "xliff inline element",
      'Click <x id="1"/> then <g id="2">here</g>',
      ['<x id="1"/>', '<g id="2">'],
    ],
    ["markup tag", "Read the <b>manual</b> first", ["<b>", "</b>"]],
    ["indexed trans tag", "Read the <0>manual</0> first", ["<0>", "</0>"]],
    ["xml entity", "Terms &amp; conditions &#160; apply", ["&amp;", "&#160;"]],
    [
      "vue linked message",
      "@:common.greeting and @.upper:common.bye",
      ["@:common.greeting", "@.upper:common.bye"],
    ],
    ["escape sequence", "First line\\nSecond line", ["\\n"]],
    ["repeated placeholder", "{{name}} met {{name}}", ["{{name}}"]],
  ])("keeps a %s token verbatim", (_label, source, tokens) => {
    const result = pseudolocalizeValue(source);

    for (const token of tokens) {
      expect(result).toContain(token);
    }
  });

  it("keeps every occurrence of a repeated placeholder", () => {
    const result = pseudolocalizeValue("{{name}} met {{name}}");

    expect(result.split("{{name}}")).toHaveLength(3);
  });

  it("returns a value that is only a placeholder without mangling it", () => {
    expect(pseudolocalizeValue("{{count}}")).toContain("{{count}}");
  });

  it("does not accent the inside of a double-brace token", () => {
    expect(pseudolocalizeValue("Hello {{count}}")).not.toContain("çôûñt");
  });
});

describe("pseudolocalizeValue: ICU message structure survives", () => {
  const PLURAL = "{count, plural, one {# item left} other {# items left}}";

  it("keeps the argument name and the plural keyword untouched", () => {
    expect(pseudolocalizeValue(PLURAL)).toContain("{count, plural, ");
  });

  it("keeps every arm selector untouched", () => {
    const result = pseudolocalizeValue(PLURAL);

    expect(result).toContain("one {");
    expect(result).toContain("other {");
  });

  it("still accents the translatable text inside an arm", () => {
    expect(pseudolocalizeValue(PLURAL)).toContain("íṫéṁ ĺéƒṫ");
  });

  it("keeps a nested argument inside a plural arm intact", () => {
    const source = "{count, plural, one {{name} has one item} other {{name} has # items}}";

    expect(pseudolocalizeValue(source)).toContain("{name}");
  });

  it("keeps a select argument's branch keys untouched", () => {
    const source = "{gender, select, male {He replied} female {She replied} other {They replied}}";
    const result = pseudolocalizeValue(source);

    expect(result).toContain("{gender, select, ");
    expect(result).toContain("male {");
    expect(result).toContain("female {");
  });

  it("keeps a plural offset clause untouched", () => {
    const source = "{count, plural, offset:1 one {# other person} other {# other people}}";

    expect(pseudolocalizeValue(source)).toContain("offset:1");
  });

  it("keeps a formatted argument's type and style untouched", () => {
    const source = "Due {when, date, ::yyyyMMdd} at last";

    expect(pseudolocalizeValue(source)).toContain("{when, date, ::yyyyMMdd}");
  });
});

describe("pseudolocalizeValue: the result stays inside the project's degeneracy limits", () => {
  it.each([
    "Save",
    "Delete this account permanently",
    "Hello {{name}}, you have {{count}} items",
    "{count, plural, one {# item left} other {# items left}}",
    LONG_SENTENCE,
  ])("is not degenerate against %s", (source) => {
    expect(assessValueDegeneracy(source, pseudolocalizeValue(source)).degenerate).toBe(false);
  });
});

describe("pseudolocalizeValue: expansion is measured per character, not per code unit", () => {
  it("counts an astral character once rather than twice", () => {
    expect(pseudolocalizeValue("ok \u{1f600}")).toBe("[óǩ \u{1f600}\u00b7\u00b7]");
  });

  it("does not pad for a combining mark stacked on a letter", () => {
    expect(pseudolocalizeValue("e\u0301e\u0301e\u0301")).toBe(
      "[é\u0301é\u0301é\u0301\u00b7\u00b7]",
    );
  });
});

describe("pseudolocalizeValue: ICU quoting", () => {
  it("leaves an apostrophe-quoted brace and the text it quotes untouched", () => {
    expect(pseudolocalizeValue("Use '{name}' verbatim")).toContain("'{name}'");
  });

  it("still accents the text outside the quoted run", () => {
    expect(pseudolocalizeValue("Use '{name}' verbatim")).toContain("ṽéŕḃáṫíṁ");
  });
});

describe("pseudolocalizeValue: brace shapes that are not ICU arguments", () => {
  it("leaves an unmatched opening brace where it is", () => {
    expect(pseudolocalizeValue("Save {draft")).toContain("Śáṽé {ḋŕáƒṫ");
  });

  it("ignores a stray closing brace with no opener", () => {
    expect(pseudolocalizeValue("Save } now")).toContain("Śáṽé } ńóẃ");
  });

  it("protects a brace group whose contents are not a valid argument name", () => {
    expect(pseudolocalizeValue("Use {not a valid name} here")).toContain("{not a valid name}");
  });

  it("protects a nested brace group in the argument-name position", () => {
    expect(pseudolocalizeValue("Use {a{b}} here")).toContain("{a{b}}");
  });

  it("protects an argument that names a type but no style", () => {
    expect(pseudolocalizeValue("Total {count, number} today")).toContain("{count, number}");
  });

  it("protects a submessage argument that declares no arms", () => {
    expect(pseudolocalizeValue("Total {count, plural} today")).toContain("{count, plural}");
  });

  it("leaves a trailing escape inside an arm rather than reaching past the arm", () => {
    expect(pseudolocalizeValue("{n, plural, other {draft\\}}")).toContain("ḋŕáƒṫ\\");
  });
});
