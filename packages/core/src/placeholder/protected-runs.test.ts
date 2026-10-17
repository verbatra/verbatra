import { describe, expect, it } from "vitest";
import { protectedRuns } from "./protected-runs.js";

function protectedTexts(value: string): string[] {
  return protectedRuns(value)
    .filter((run) => run.protected)
    .map((run) => run.text);
}

describe("protectedRuns", () => {
  it("returns no run for an empty value", () => {
    expect(protectedRuns("")).toEqual([]);
  });

  it("returns one translatable run for plain text", () => {
    expect(protectedRuns("Save changes")).toEqual([{ protected: false, text: "Save changes" }]);
  });

  it.each([
    ["Hello {{name}}!", ["{{name}}"]],
    ["Hello {name}!", ["{name}"]],
    ["%1$s of %2$d", ["%1$s", "%2$d"]],
    ["Hi %(user)s", ["%(user)s"]],
    ["Hi %@", ["%@"]],
    ["See $t(common.more)", ["$t(common.more)"]],
    ["Go @:nav.home", ["@:nav.home"]],
    ["A <b>bold</b> move", ["<b>", "</b>"]],
    ["Tom &amp; Jerry", ["&amp;"]],
    ["Line\\nbreak", ["\\n"]],
    ["{0} files", ["{0}"]],
  ])("protects the syntax of %s", (value, expected) => {
    expect(protectedTexts(value)).toEqual(expected);
  });

  it("protects ICU structure but leaves each arm's text translatable", () => {
    const runs = protectedRuns("{count, plural, one {# item} other {# items}}");

    expect(runs).toEqual([
      { protected: true, text: "{count, plural, one {" },
      { protected: false, text: "# item" },
      { protected: true, text: "} other {" },
      { protected: false, text: "# items" },
      { protected: true, text: "}}" },
    ]);
  });

  it.each([
    ["{件数, plural, one {# 件} other {# 件の品}}", "件数"],
    ["{número, select, one {uno} other {otro}}", "número"],
    ["{नाम, plural, one {# चीज़} other {# चीज़ें}}", "नाम"],
  ])("leaves the arm text of %s translatable for the non-ASCII argument %s", (value, name) => {
    const runs = protectedRuns(value);

    expect(runs[0]?.text.startsWith(`{${name}, `)).toBe(true);
    expect(runs.filter((run) => !run.protected).length).toBe(2);
  });

  it("does not read a dotted name as an ICU argument, so the whole brace stays protected", () => {
    expect(protectedRuns("{user.name, plural, one {a} other {b}}")).toEqual([
      { protected: true, text: "{user.name, plural, one {a} other {b}}" },
    ]);
  });

  it.each([
    "Hello {{name}}, you have {count, plural, one {# <b>item</b>} other {# items}} %s",
    "{unbalanced",
    "}{",
    "  padded  ",
    "emoji 👋 {x}",
    "",
  ])("joins back to exactly the value %j", (value) => {
    expect(
      protectedRuns(value)
        .map((run) => run.text)
        .join(""),
    ).toBe(value);
  });

  it("alternates protected and translatable runs, never repeating a kind", () => {
    const runs = protectedRuns("a {b} c {d}{e} f");

    for (let index = 1; index < runs.length; index += 1) {
      expect(runs[index]?.protected).not.toBe(runs[index - 1]?.protected);
    }
  });
});
