import IntlMessageFormat from "intl-messageformat";
import { describe, expect, it } from "vitest";
import { baseConfig } from "../test-support.js";
import {
  ICU_PREVIEW_MAX_ROWS,
  type IcuPreviewInput,
  type IcuPreviewRow,
  previewIcuMessage,
} from "./icu-preview.js";

function rowsOf(
  value: string,
  locale: string,
  args?: IcuPreviewInput["args"],
): { readonly rows: readonly IcuPreviewRow[]; readonly truncated: boolean } {
  const result = previewIcuMessage({
    config: baseConfig({ format: "next-intl-json" }),
    locale,
    value,
    ...(args === undefined ? {} : { args }),
  });
  if (!result.supported || !result.valid) {
    throw new Error(`not previewable: ${JSON.stringify(result)}`);
  }
  return result;
}

function textOf(row: IcuPreviewRow): string {
  return row.segments.map((segment) => segment.text).join("");
}

function sampleRows(
  value: string,
  locale: string,
  args: IcuPreviewInput["args"],
): readonly IcuPreviewRow[] {
  return rowsOf(value, locale, args).rows.filter((row) => row.axis === "sample");
}

const POLISH = "{n, plural, one {# plik} few {# pliki} many {# plikow} other {# pliku}}";

describe("previewIcuMessage: a supplied value for a plural, ordinal or select argument", () => {
  it.each([
    [1, "one"],
    [22, "few"],
    [25, "many"],
    [1.5, "other"],
  ])("adds one row in Polish for %s that agrees with intl-messageformat", (count, category) => {
    const rows = sampleRows(POLISH, "pl", { n: count });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      axis: "sample",
      argument: "n",
      category,
      sample: count,
      held: {},
    });
    expect(textOf(rows[0] as IcuPreviewRow)).toBe(
      String(new IntlMessageFormat(POLISH, "pl").format({ n: count })),
    );
  });

  it("names an exact arm when the value matches one", () => {
    const message = "{n, plural, =0 {none} one {# file} other {# files}}";

    expect(sampleRows(message, "en", { n: 0 })[0]).toMatchObject({ category: "=0" });
    expect(textOf(sampleRows(message, "en", { n: 0 })[0] as IcuPreviewRow)).toBe(
      String(new IntlMessageFormat(message, "en").format({ n: 0 })),
    );
  });

  it("resolves the category after the offset, as the runtime does", () => {
    const message = "{n, plural, offset:1 =0 {nobody} one {# other} other {# others}}";
    const rows = sampleRows(message, "en", { n: 2 });

    expect(rows[0]).toMatchObject({ category: "one" });
    expect(textOf(rows[0] as IcuPreviewRow)).toBe(
      String(new IntlMessageFormat(message, "en").format({ n: 2 })),
    );
  });

  it("resolves an ordinal value", () => {
    const message = "{n, selectordinal, one {#st} two {#nd} few {#rd} other {#th}}";
    const rows = sampleRows(message, "en", { n: 22 });

    expect(rows[0]).toMatchObject({ category: "two", sample: 22 });
    expect(textOf(rows[0] as IcuPreviewRow)).toBe(
      String(new IntlMessageFormat(message, "en").format({ n: 22 })),
    );
  });

  it("falls back to other for a select value no option names and for text given to a plural", () => {
    const select = "{g, select, f {She} m {He} other {They}}";

    expect(sampleRows(select, "en", { g: "m" })[0]).toMatchObject({ category: "m" });
    expect(sampleRows(select, "en", { g: "zzz" })[0]).toMatchObject({ category: "other" });
    expect(textOf(sampleRows(select, "en", { g: "zzz" })[0] as IcuPreviewRow)).toBe("They");
    expect(sampleRows(POLISH, "pl", { n: "many" })[0]).toMatchObject({ category: "other" });
  });

  it("adds no row for an argument the caller did not supply, or an inherited name", () => {
    expect(rowsOf(POLISH, "pl").rows.some((row) => row.axis === "sample")).toBe(false);
    expect(rowsOf(POLISH, "pl", { other: 3 }).rows.some((row) => row.axis === "sample")).toBe(
      false,
    );
    const inherited = rowsOf("{constructor, plural, one {a} other {b}}", "en", {}).rows;
    expect(inherited.some((row) => row.axis === "sample")).toBe(false);
  });

  it("places the row after that argument's own rows", () => {
    const rows = rowsOf(POLISH, "pl", { n: 22 }).rows;

    expect(rows.map((row) => row.axis)).toEqual(["plural", "plural", "plural", "plural", "sample"]);
  });

  it("holds the enclosing arguments at their arms and lists them", () => {
    const message =
      "{gender, select, female {{n, plural, one {She has # cat} other {She has # cats}}} other {They have pets}}";
    const [row] = sampleRows(message, "en", { n: 7 });

    expect(row).toMatchObject({ argument: "n", category: "other", held: { gender: "female" } });
    expect(textOf(row as IcuPreviewRow)).toBe("She has 7 cats");
  });

  it("counts the row toward the cap and still shows it when the arms fill the cap", () => {
    const options = Array.from({ length: 30 }, (_unused, index) => `o${index} {v${index}}`).join(
      " ",
    );
    const message = `{s, select, ${options} other {x}} {n, plural, one {# a} other {# b}}`;

    const { rows, truncated } = rowsOf(message, "en", { n: 3 });

    expect(rows.length).toBeLessThanOrEqual(ICU_PREVIEW_MAX_ROWS);
    expect(truncated).toBe(true);
    expect(rows.filter((row) => row.axis === "sample")).toHaveLength(1);
  });

  it("adds none when no row for the argument can be reached", () => {
    const message =
      "{a, select, x {{a, select, y {{b, plural, one {1} other {2}}} other {q}}} other {z}}";

    const { rows } = rowsOf(message, "en", { b: 3 });

    expect(rows.some((row) => row.argument === "b")).toBe(false);
  });
});

describe("previewIcuMessage: held arguments", () => {
  it("is empty for an argument that is not nested and for a message with nothing to vary", () => {
    expect(rowsOf(POLISH, "pl").rows.every((row) => Object.keys(row.held).length === 0)).toBe(true);
    expect(rowsOf("Hello", "en").rows[0]?.held).toEqual({});
  });

  it("tells nested rows apart by the outer arm they sit under", () => {
    const message =
      "{g, select, f {{n, plural, one {She 1} other {She n}}} m {{n, plural, one {He 1} other {He n}}} other {They}}";

    const held = rowsOf(message, "en")
      .rows.filter((row) => row.argument === "n")
      .map((row) => `${row.held.g}/${row.category}`);

    expect(held).toEqual(["f/one", "m/one", "f/other", "m/other"]);
  });

  it("keeps a hostile argument name as an own key", () => {
    const message = "{__proto__, select, a {{n, plural, one {x} other {y}}} other {z}}";

    const rows = rowsOf(message, "en").rows.filter((row) => row.argument === "n");

    expect(Object.keys(rows[0]?.held ?? {})).toContain("__proto__");
    expect(Object.getPrototypeOf(rows[0]?.held)).toBe(Object.prototype);
  });
});
