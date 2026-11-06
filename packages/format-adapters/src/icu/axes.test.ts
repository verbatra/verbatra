import { describe, expect, it } from "vitest";
import { icuVariationAxes } from "./axes.js";
import { ICU_MAX_VALUE_LENGTH } from "./limits.js";

describe("icuVariationAxes", () => {
  it("finds nothing to vary in plain text", () => {
    expect(icuVariationAxes("Hello {name}")).toEqual([]);
    expect(icuVariationAxes("no braces")).toEqual([]);
  });

  it("lists a plural with its exact arms and offset", () => {
    expect(
      icuVariationAxes("{n, plural, offset:1 =0 {none} =7 {seven} one {# x} other {# y}}"),
    ).toEqual([{ argument: "n", kind: "plural", offset: 1, exact: [0, 7], selectors: [] }]);
  });

  it("separates cardinal from ordinal uses of one argument", () => {
    expect(icuVariationAxes("{n, plural, other {a}} {n, selectordinal, =1 {b} other {c}}")).toEqual(
      [
        { argument: "n", kind: "plural", offset: 0, exact: [], selectors: [] },
        { argument: "n", kind: "ordinal", offset: 0, exact: [1], selectors: [] },
      ],
    );
  });

  it("lists select options in source order and merges repeats", () => {
    expect(
      icuVariationAxes("{g, select, f {x} m {y} other {z}} {g, select, f {x} nb {w} other {v}}"),
    ).toEqual([
      { argument: "g", kind: "select", offset: 0, exact: [], selectors: ["f", "m", "other", "nb"] },
    ]);
  });

  it("finds axes nested in arms and tags", () => {
    const axes = icuVariationAxes(
      "<b>{g, select, f {{n, plural, =0 {z} other {#}}} other {x}}</b>",
    );
    expect(axes?.map((axis) => `${axis.kind}:${axis.argument}`)).toEqual(["select:g", "plural:n"]);
    expect(axes?.[1]?.exact).toEqual([0]);
  });

  it("refuses a message over the length cap even when it parses", () => {
    const value = `{n, plural, other {${"x".repeat(ICU_MAX_VALUE_LENGTH)}}}`;
    expect(icuVariationAxes(value)).toEqual([]);
    expect(icuVariationAxes("{n, plural, other {x}}")).toHaveLength(1);
  });

  it("finds nothing in an invalid or refused message", () => {
    expect(icuVariationAxes("{n, plural, one {x}}")).toEqual([]);
    expect(icuVariationAxes("{")).toEqual([]);
    expect(icuVariationAxes(`{a}${"x".repeat(ICU_MAX_VALUE_LENGTH)}`)).toEqual([]);
    expect(icuVariationAxes("{".repeat(40))).toEqual([]);
  });
});
