import { describe, expect, it } from "vitest";
import { type IcuVariationAxis, icuExactArmValue, icuVariationAxesOf } from "./axes.js";
import { prepareIcuMessage } from "./render.js";

function axesOf(value: string): readonly IcuVariationAxis[] {
  const result = prepareIcuMessage(value, "en");
  if (!result.valid) {
    throw new Error(`refused: ${result.reason}`);
  }
  return icuVariationAxesOf(result.prepared.ast);
}

describe("icuVariationAxesOf", () => {
  it("finds nothing to vary in plain text", () => {
    expect(axesOf("Hello {name}")).toEqual([]);
    expect(axesOf("no braces")).toEqual([]);
  });

  it("lists a plural occurrence with its options in source order and its offset", () => {
    const [axis] = axesOf("{n, plural, offset:1 =0 {none} =7 {seven} one {# x} other {# y}}");
    expect(axis).toMatchObject({ argument: "n", kind: "plural" });
    expect(axis?.occurrences).toEqual([
      { path: [], offset: 1, options: ["=0", "=7", "one", "other"] },
    ]);
  });

  it("separates cardinal from ordinal uses of one argument", () => {
    const axes = axesOf("{n, plural, other {a}} {n, selectordinal, =1 {b} other {c}}");
    expect(axes.map((axis) => [axis.kind, axis.occurrences[0]?.options])).toEqual([
      ["plural", ["other"]],
      ["ordinal", ["=1", "other"]],
    ]);
  });

  it("keeps every occurrence of a repeated argument, each with its own offset and options", () => {
    const [axis] = axesOf(
      "{n, plural, offset:1 one {a} other {b}} {n, plural, offset:2 =3 {c} other {d}}",
    );
    expect(axis?.occurrences.map((occurrence) => [occurrence.offset, occurrence.options])).toEqual([
      [1, ["one", "other"]],
      [2, ["=3", "other"]],
    ]);
  });

  it("records the step each nested occurrence sits in", () => {
    const axes = axesOf(
      "{count, plural, offset:1 =0 {none} one {<b>{gender, select, female {She} other {They}}</b>} other {x}}",
    );
    const gender = axes.find((axis) => axis.argument === "gender");
    expect(gender?.occurrences[0]?.path).toEqual([
      {
        argument: "count",
        kind: "plural",
        offset: 1,
        options: ["=0", "one", "other"],
        selector: "one",
      },
    ]);
  });

  it("records every ancestor of an occurrence three levels down", () => {
    const axes = axesOf(
      "{a, select, x {{b, plural, one {{c, select, p {P} other {Q}}} other {B}}} other {A}}",
    );
    const path = axes.find((axis) => axis.argument === "c")?.occurrences[0]?.path;
    expect(path?.map((step) => `${step.argument}:${step.selector}`)).toEqual(["a:x", "b:one"]);
  });
});

describe("icuExactArmValue", () => {
  it("reads a canonical exact selector", () => {
    expect(icuExactArmValue("=0")).toBe(0);
    expect(icuExactArmValue("=-1")).toBe(-1);
    expect(icuExactArmValue("=12")).toBe(12);
  });

  it("refuses a selector the runtime would never build", () => {
    for (const selector of ["=01", "=+1", "=-0", "=1.5", "one", "=", "= 1", "=1 "]) {
      expect(icuExactArmValue(selector)).toBeUndefined();
    }
  });
});
