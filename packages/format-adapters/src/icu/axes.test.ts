import { describe, expect, it } from "vitest";
import { type IcuVariationAxis, icuVariationAxesOf } from "./axes.js";
import { prepareIcuMessage } from "./render.js";

function axesOf(value: string): readonly IcuVariationAxis[] {
  const result = prepareIcuMessage(value, "en");
  if (!result.valid) {
    throw new Error(`refused: ${result.reason}`);
  }
  return icuVariationAxesOf(result.prepared.ast);
}

function armsOf(axis: IcuVariationAxis | undefined): string[] {
  return axis?.arms.map((arm) => arm.selector) ?? [];
}

describe("icuVariationAxesOf", () => {
  it("finds nothing to vary in plain text", () => {
    expect(axesOf("Hello {name}")).toEqual([]);
    expect(axesOf("no braces")).toEqual([]);
  });

  it("lists a plural with its arms in source order and its offset", () => {
    const [axis] = axesOf("{n, plural, offset:1 =0 {none} =7 {seven} one {# x} other {# y}}");
    expect(axis).toMatchObject({ argument: "n", kind: "plural", offset: 1, path: [] });
    expect(armsOf(axis)).toEqual(["=0", "=7", "one", "other"]);
  });

  it("separates cardinal from ordinal uses of one argument", () => {
    const axes = axesOf("{n, plural, other {a}} {n, selectordinal, =1 {b} other {c}}");
    expect(axes.map((axis) => [axis.kind, armsOf(axis)])).toEqual([
      ["plural", ["other"]],
      ["ordinal", ["=1", "other"]],
    ]);
  });

  it("merges repeated selects and keeps the first path of each arm", () => {
    const [axis] = axesOf("{g, select, f {x} m {y} other {z}} {g, select, f {x} nb {w} other {v}}");
    expect(armsOf(axis)).toEqual(["f", "m", "other", "nb"]);
  });

  it("records the arm each nested axis sits in", () => {
    const axes = axesOf(
      "{count, plural, =0 {none} one {<b>{gender, select, female {She} other {They}}</b>} other {{gender, select, other {x}}}}",
    );
    const gender = axes.find((axis) => axis.argument === "gender");
    expect(gender?.path).toEqual([{ argument: "count", kind: "plural", selector: "one" }]);
    expect(gender?.arms.find((arm) => arm.selector === "female")?.path).toEqual(gender?.path);
  });

  it("records every ancestor of an axis three levels down", () => {
    const axes = axesOf(
      "{a, select, x {{b, plural, one {{c, select, p {P} other {Q}}} other {B}}} other {A}}",
    );
    expect(axes.find((axis) => axis.argument === "c")?.path).toEqual([
      { argument: "a", kind: "select", selector: "x" },
      { argument: "b", kind: "plural", selector: "one" },
    ]);
  });
});
