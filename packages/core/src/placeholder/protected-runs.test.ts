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
