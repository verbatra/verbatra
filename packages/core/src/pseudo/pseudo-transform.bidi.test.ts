import { describe, expect, it } from "vitest";
import { protectedRuns } from "../placeholder/protected-runs.js";
import { assessBidiControls } from "../validation/bidi-controls.js";
import { pseudolocalizeBidiValue } from "./pseudo-transform.js";

const RLM = "‏";
const RLO = "‮";
const PDF = "‬";
const BIDI_CONTROL = /[‏‬‮]/g;

function overridden(word: string): string {
  return `${RLM}${RLO}${word}${PDF}${RLM}`;
}

function protectedTexts(value: string): readonly string[] {
  return protectedRuns(value)
    .filter((run) => run.protected)
    .map((run) => run.text);
}

const CASES: readonly (readonly [string, string])[] = [
  ["plain text", "Save your changes"],
  ["double-brace placeholder", "Hello {{name}}, welcome"],
  ["single-brace placeholder", "Hello {name}, welcome"],
  ["positional printf", "Hello %1$s, you have %2$d messages"],
  ["apple printf", "Welcome back, %@"],
  ["markup", "Read the <b>manual</b> first"],
  ["ICU plural", "{count, plural, one {# item left} other {# items left}}"],
  ["ICU select", "{gender, select, male {He replied} other {They replied}}"],
  ["escape sequence", "First line\\nSecond line"],
  ["entity", "Terms &amp; conditions"],
  ["edge whitespace", "  Save now  "],
  ["empty", ""],
  ["placeholder only", "{{count}}"],
];

describe("pseudolocalizeBidiValue: the right-to-left override", () => {
  it("wraps every word in a right-to-left mark and override", () => {
    expect(pseudolocalizeBidiValue("Save now")).toBe(`${overridden("Save")} ${overridden("now")}`);
  });

  it("keeps the letters in their stored order, so the file stays readable", () => {
    expect(pseudolocalizeBidiValue("Save now").replace(BIDI_CONTROL, "")).toBe("Save now");
  });

  it("neither accents nor pads nor brackets the value", () => {
    const result = pseudolocalizeBidiValue("Save");

    expect(result).not.toContain("[");
    expect(result).not.toContain("·");
    expect(result).toContain("Save");
  });

  it("leaves digits outside the override, as numbers in right-to-left text read left to right", () => {
    expect(pseudolocalizeBidiValue("42 items")).toBe(`42 ${overridden("items")}`);
  });

  it("leaves punctuation and edge whitespace outside the override", () => {
    expect(pseudolocalizeBidiValue("  Done!  ")).toBe(`  ${overridden("Done")}!  `);
  });

  it("keeps a combining mark inside the word it belongs to", () => {
    expect(pseudolocalizeBidiValue("café")).toBe(overridden("café"));
  });

  it("leaves an empty value empty", () => {
    expect(pseudolocalizeBidiValue("")).toBe("");
  });

  it("leaves a whitespace-only value as it is", () => {
    expect(pseudolocalizeBidiValue("   ")).toBe("   ");
  });

  it("produces the same output on every run", () => {
    const source = "One {count} item left";

    expect(pseudolocalizeBidiValue(source)).toBe(pseudolocalizeBidiValue(source));
  });
});

describe("pseudolocalizeBidiValue: placeholders, ICU syntax and markup stay outside the override", () => {
  it.each(CASES)("%s keeps every protected run byte-identical", (_label, source) => {
    expect(protectedTexts(pseudolocalizeBidiValue(source))).toEqual(protectedTexts(source));
  });

  it.each(CASES)("%s is balanced: every override is closed", (_label, source) => {
    const assessment = assessBidiControls(pseudolocalizeBidiValue(source));

    expect(assessment.balanced).toBe(true);
    expect(assessment.leftOverrides).toBe(0);
  });

  it.each(CASES)(
    "%s holds only the stored text once the controls are removed",
    (_label, source) => {
      expect(pseudolocalizeBidiValue(source).replace(BIDI_CONTROL, "")).toBe(source);
    },
  );

  it("never puts a placeholder inside an override", () => {
    expect(pseudolocalizeBidiValue("Hello {{name}}, welcome")).toBe(
      `${overridden("Hello")} {{name}}, ${overridden("welcome")}`,
    );
  });

  it("overrides the text of each plural arm while the syntax stays untouched", () => {
    expect(pseudolocalizeBidiValue("{count, plural, one {# item} other {# items}}")).toBe(
      `{count, plural, one {# ${overridden("item")}} other {# ${overridden("items")}}}`,
    );
  });

  it("overrides the text inside markup but never the tag", () => {
    expect(pseudolocalizeBidiValue("<b>Bold</b>")).toBe(`<b>${overridden("Bold")}</b>`);
  });

  it("leaves an escape sequence between two words outside the override", () => {
    expect(pseudolocalizeBidiValue("one\\ntwo")).toBe(
      `${overridden("one")}\\n${overridden("two")}`,
    );
  });
});
