import { SUPPORTED_FORMATS } from "@verbatra/core";
import { createDefaultRegistry } from "@verbatra/format-adapters";
import { describe, expect, it } from "vitest";
import { baseConfig } from "../test-support.js";
import {
  ICU_PREVIEW_MAX_ROWS,
  type IcuPreviewInput,
  type IcuPreviewResult,
  type IcuPreviewRow,
  previewIcuMessage,
} from "./icu-preview.js";

function preview(
  value: string,
  locale = "en",
  args?: IcuPreviewInput["args"],
  format: IcuPreviewInput["config"]["format"] = "next-intl-json",
): IcuPreviewResult {
  return previewIcuMessage({
    config: baseConfig({ format }),
    locale,
    value,
    ...(args === undefined ? {} : { args }),
  });
}

function rowsOf(value: string, locale = "en", args?: IcuPreviewInput["args"]): IcuPreviewRow[] {
  const result = preview(value, locale, args);
  if (!result.supported || !result.valid) {
    throw new Error(`not previewable: ${JSON.stringify(result)}`);
  }
  return [...result.rows];
}

function textOf(row: IcuPreviewRow): string {
  return row.segments.map((segment) => segment.text).join("");
}

function refusalOf(
  value: string,
  locale = "en",
  args?: IcuPreviewInput["args"],
): string | undefined {
  const result = preview(value, locale, args);
  return result.supported && !result.valid ? result.reason : undefined;
}

describe("previewIcuMessage: which formats use ICU syntax", () => {
  it("answers supported exactly for the adapters whose validateMessage parses ICU", () => {
    const registry = createDefaultRegistry();
    const icuByValidation: string[] = [];
    const icuByPreview: string[] = [];
    for (const format of SUPPORTED_FORMATS) {
      const resolution = registry.resolve("", { format });
      if (resolution.status !== "resolved") {
        throw new Error(`no adapter for ${format}`);
      }
      if (!resolution.adapter.validateMessage("{")) {
        icuByValidation.push(format);
      }
      if (preview("Hello", "en", undefined, format).supported) {
        icuByPreview.push(format);
      }
    }
    expect(icuByValidation.sort()).toEqual(["arb", "next-intl-json"]);
    expect(icuByPreview.sort()).toEqual(icuByValidation);
  });

  it("answers not-icu for every other format, including a third-party one", () => {
    expect(preview("{n, plural, one {x} other {y}}", "en", undefined, "i18next-json")).toEqual({
      supported: false,
      reason: "not-icu",
    });
    expect(preview("{", "en", undefined, "custom:toml")).toEqual({
      supported: false,
      reason: "not-icu",
    });
  });

  it("previews arb as well", () => {
    expect(preview("Hello", "en", undefined, "arb")).toMatchObject({
      supported: true,
      valid: true,
    });
  });
});

describe("previewIcuMessage: refusals", () => {
  it("returns a reason instead of throwing for hostile text", () => {
    const cases: readonly (readonly [string, string, string])[] = [
      ["a".repeat(20_001), "en", "too-long"],
      ["{".repeat(5000), "en", "too-complex"],
      ["<b>".repeat(3000), "en", "too-complex"],
      ["{a}".repeat(300), "en", "too-complex"],
      ["{a, select, other {{a, select, other {".repeat(9), "en", "too-complex"],
      ["{", "en", "invalid-message"],
      ["{n, plural, one {x}}", "en", "invalid-message"],
      ['<img src=x onerror="alert(1)">', "en", "invalid-message"],
      ["Hello", "", "unsupported-locale"],
      ["Hello", "!!!", "unsupported-locale"],
      ["Hello", "zz", "unsupported-locale"],
      ["Hello", "x".repeat(200), "unsupported-locale"],
    ];
    for (const [value, locale, reason] of cases) {
      expect(preview(value, locale)).toEqual({ supported: true, valid: false, reason });
    }
  });

  it("refuses a preview whose first row alone is past the output budget", () => {
    const value = `{n, plural, one {${"#".repeat(6000)}} other {x}}`;
    expect(refusalOf(value, "en")).toBe("too-large");
  });

  it("returns the rows that fit when a later row runs the shared budget out", () => {
    const value = `{n, plural, one {${"#".repeat(4000)}} other {${"#".repeat(4000)}}}`;
    const result = preview(value);
    expect(result).toMatchObject({ valid: true, truncated: true });
    expect(result.supported && result.valid && result.rows.map((row) => row.category)).toEqual([
      "one",
    ]);
  });

  it("copes with non-finite and hostile samples", () => {
    const value = "{x, number} {y} {d, date} {n, plural, one {# a} other {# b}}";
    const result = preview(value, "en", {
      x: Number.NaN,
      y: Number.POSITIVE_INFINITY,
      d: Number.NaN,
      n: Number.NaN,
    });
    expect(result).toMatchObject({ supported: true, valid: true });
    const rows = rowsOf(value, "en", { x: Number.NEGATIVE_INFINITY, d: 8.64e15 + 1 });
    expect(textOf(rows[0] as IcuPreviewRow)).toContain("-∞");
    expect(textOf(rows[0] as IcuPreviewRow)).toContain("{d}");
  });

  it("ignores inherited, unused and non-primitive samples", () => {
    const inherited = Object.create({ name: "leaked" }) as Record<string, string>;
    expect(textOf(rowsOf("Hi {name}", "en", inherited)[0] as IcuPreviewRow)).toBe("Hi {name}");
    const odd = { name: { toString: () => "x" }, extra: 1 } as unknown as Record<string, string>;
    expect(textOf(rowsOf("Hi {name}", "en", odd)[0] as IcuPreviewRow)).toBe("Hi {name}");
  });
});

describe("previewIcuMessage: rows", () => {
  it("gives one row per exact arm and plural category, with a sample that selects it", () => {
    const rows = rowsOf("{n, plural, =0 {none} one {# item} other {# items}}");
    expect(rows.map((row) => [row.category, row.sample, textOf(row)])).toEqual([
      ["=0", 0, "none"],
      ["one", 1, "1 item"],
      ["other", 2, "2 items"],
    ]);
    expect(rows.every((row) => row.axis === "plural" && row.argument === "n")).toBe(true);
  });

  it("covers every Arabic category", () => {
    const rows = rowsOf("{n, plural, zero {z} one {o} two {t} few {f} many {m} other {x}}", "ar");
    expect(rows.map((row) => [row.category, row.sample, textOf(row)])).toEqual([
      ["zero", 0, "z"],
      ["one", 1, "o"],
      ["two", 2, "t"],
      ["few", 3, "f"],
      ["many", 11, "m"],
      ["other", 100, "x"],
    ]);
  });

  it("covers every Polish category, with a fraction for other", () => {
    const rows = rowsOf("{n, plural, one {o} few {f} many {m} other {x}}", "pl");
    expect(rows.map((row) => [row.category, row.sample, textOf(row)])).toEqual([
      ["one", 1, "o"],
      ["few", 2, "f"],
      ["many", 5, "m"],
      ["other", 0.5, "x"],
    ]);
  });

  it("finds a large sample for a category only big numbers reach", () => {
    const rows = rowsOf("{n, plural, one {o} many {m} other {x}}", "fr");
    expect(rows.find((row) => row.category === "many")?.sample).toBe(1_000_000);
  });

  it("selects ordinal categories", () => {
    const rows = rowsOf("{n, selectordinal, one {#st} two {#nd} few {#rd} other {#th}}");
    expect(rows.map((row) => [row.axis, row.category, textOf(row)])).toEqual([
      ["ordinal", "one", "1st"],
      ["ordinal", "two", "2nd"],
      ["ordinal", "few", "3rd"],
      ["ordinal", "other", "4th"],
    ]);
  });

  it("applies the offset to the category and shows the pound without it", () => {
    const rows = rowsOf(
      "{n, plural, offset:1 =0 {nobody} one {you and # other} other {you and # others}}",
    );
    expect(rows.map((row) => [row.category, row.sample, textOf(row)])).toEqual([
      ["=0", 0, "nobody"],
      ["one", 2, "you and 1 other"],
      ["other", 3, "you and 2 others"],
    ]);
  });

  it("never picks a sample an exact arm would intercept", () => {
    const rows = rowsOf("{n, plural, =1 {exact} one {# one} other {# other}}");
    expect(rows.map((row) => row.category)).toEqual(["=1", "other"]);
    expect(rows.map(textOf)).toEqual(["exact", "2 other"]);
  });

  it("gives one row per select option in source order", () => {
    const rows = rowsOf("{g, select, f {She} m {He} other {They}} left");
    expect(
      rows.map((row) => [row.axis, row.argument, row.category, row.sample, textOf(row)]),
    ).toEqual([
      ["select", "g", "f", "f", "She left"],
      ["select", "g", "m", "m", "He left"],
      ["select", "g", "other", "other", "They left"],
    ]);
  });

  it("varies one argument at a time against defaults for the rest", () => {
    const rows = rowsOf(
      "{g, select, f {She} other {They}} have {n, plural, one {# cat} other {# cats}}",
    );
    expect(rows.map((row) => `${row.argument}=${row.category}: ${textOf(row)}`)).toEqual([
      "g=f: She have 2 cats",
      "g=other: They have 2 cats",
      "n=one: They have 1 cat",
      "n=other: They have 2 cats",
    ]);
  });

  it("holds a supplied sample fixed on the axes it does not vary", () => {
    const rows = rowsOf(
      "{g, select, f {She} other {They}} have {n, plural, one {# cat} other {# cats}}",
      "en",
      { g: "f", n: 9 },
    );
    expect(rows.map(textOf)).toEqual([
      "She have 9 cats",
      "They have 9 cats",
      "She have 1 cat",
      "She have 2 cats",
    ]);
  });

  it("returns one row for a message with nothing to vary", () => {
    expect(rowsOf("Hi {name}", "en", { name: "Mario" })).toEqual([
      {
        axis: "none",
        argument: null,
        category: null,
        sample: null,
        segments: [
          { kind: "text", text: "Hi " },
          { kind: "argument", text: "Mario" },
        ],
      },
    ]);
    expect(rowsOf("")).toHaveLength(1);
  });

  it("defaults number, date and plain arguments", () => {
    expect(textOf(rowsOf("{n, number} {d, date, ::yyyyMMdd} {who}")[0] as IcuPreviewRow)).toBe(
      "1,234.5 03/15/2024 {who}",
    );
  });

  it("renders tags as tag segments", () => {
    const [row] = rowsOf("<b>{n, plural, one {# x} other {# y}}</b>");
    expect(row?.segments.map((segment) => segment.kind)).toEqual([
      "tag",
      "argument",
      "text",
      "tag",
    ]);
  });

  it("handles an argument named like a prototype member", () => {
    const rows = rowsOf("{__proto__, plural, one {# a} other {# b}}");
    expect(rows.map(textOf)).toEqual(["1 a", "2 b"]);
    expect(
      textOf(rowsOf("{constructor} {toString}", "en", { constructor: "c" })[0] as IcuPreviewRow),
    ).toBe("c {toString}");
  });

  it("caps the rows and says so", () => {
    const options = Array.from({ length: 30 }, (_unused, index) => `o${index} {v${index}}`).join(
      " ",
    );
    const result = preview(`{s, select, ${options} other {x}}`);
    expect(result).toMatchObject({ supported: true, valid: true, truncated: true });
    expect(result.supported && result.valid && result.rows).toHaveLength(ICU_PREVIEW_MAX_ROWS);
    const exact = Array.from(
      { length: ICU_PREVIEW_MAX_ROWS - 1 },
      (_unused, index) => `o${index} {v}`,
    );
    const atCap = preview(`{s, select, ${exact.join(" ")} other {x}}`);
    expect(atCap).toMatchObject({ valid: true, truncated: false });
    expect(atCap.supported && atCap.valid && atCap.rows).toHaveLength(ICU_PREVIEW_MAX_ROWS);
  });

  it("describes the message's arguments", () => {
    expect(preview("{n, plural, other {#}} {name}")).toMatchObject({
      arguments: {
        style: "named",
        named: [
          { name: "n", type: "number" },
          { name: "name", type: "unknown" },
        ],
      },
    });
    expect(preview("Hello")).toMatchObject({ arguments: { style: "none" } });
  });

  it("accepts an underscore locale", () => {
    expect(rowsOf("{n, plural, one {a} other {b}}", "en_GB").map(textOf)).toEqual(["a", "b"]);
  });

  it("does not modify the supplied samples", () => {
    const args = Object.freeze({ n: 4 });
    expect(() => preview("{n, plural, one {a} other {b}}", "en", args)).not.toThrow();
  });
});

function summary(value: string, locale = "en"): string[] {
  return rowsOf(value, locale).map((row) => `${row.argument}=${row.category}: ${textOf(row)}`);
}

describe("previewIcuMessage: nested axes show the arm they name", () => {
  const MESSAGES = {
    outerPlural:
      "{count, plural, =0 {No messages} one {{gender, select, female {She has one} male {He has one} other {They have one}}} other {# messages}}",
    outerSelect:
      "{gender, select, female {{n, plural, one {She has # cat} other {She has # cats}}} other {They have pets}}",
    threeLevels:
      "{a, select, x {{b, plural, one {{c, select, p {P} other {Q}}} other {B}}} other {A}}",
  } as const;

  it("holds the enclosing plural at the arm that contains the select", () => {
    expect(summary(MESSAGES.outerPlural)).toEqual([
      "count==0: No messages",
      "count=one: They have one",
      "count=other: 2 messages",
      "gender=female: She has one",
      "gender=male: He has one",
      "gender=other: They have one",
    ]);
  });

  it("holds the enclosing select at the arm that contains the plural", () => {
    expect(summary(MESSAGES.outerSelect)).toEqual([
      "gender=female: She has 2 cats",
      "gender=other: They have pets",
      "n=one: She has 1 cat",
      "n=other: She has 2 cats",
    ]);
  });

  it("holds every ancestor of an axis three levels down", () => {
    expect(summary(MESSAGES.threeLevels)).toEqual([
      "a=x: B",
      "a=other: A",
      "b=one: Q",
      "b=other: B",
      "c=p: P",
      "c=other: Q",
    ]);
  });

  it("shows each row's own arm text across locales", () => {
    const armText: Readonly<Record<string, readonly [string, string]>> = {
      outerPlural: ["gender=female", "She has one"],
      outerSelect: ["n=one", "She has 1 cat"],
      threeLevels: ["c=p", "P"],
    };
    for (const locale of ["en", "de", "pl", "ar"]) {
      for (const [name, [row, literal]] of Object.entries(armText)) {
        const found = summary(MESSAGES[name as keyof typeof MESSAGES], locale).find((line) =>
          line.startsWith(`${row}:`),
        );
        expect(found, `${name} in ${locale}`).toContain(literal);
      }
    }
  });

  it("uses the first place an arm appears when an argument has several parents", () => {
    const lines = summary(
      "{a, select, x {{g, select, f {F1} other {O1}}} y {{g, select, f {F2} m {M2} other {O2}}} other {z}}",
    );
    expect(lines.filter((line) => line.startsWith("g="))).toEqual([
      "g=f: F1",
      "g=other: O1",
      "g=m: M2",
    ]);
  });

  it("takes an exact arm's enclosing arm from where that arm first appears", () => {
    const lines = summary(
      "{a, select, x {{n, plural, one {A} other {Ao}}} y {{n, plural, =0 {zero} one {B} other {Bo}}} other {z}}",
    );
    expect(lines.filter((line) => line.startsWith("n="))).toEqual([
      "n==0: zero",
      "n=one: A",
      "n=other: Ao",
    ]);
  });

  it("leaves out rows whose enclosing arm this locale can never select", () => {
    const lines = summary("{n, plural, few {{g, select, f {x} other {y}}} other {z}}");
    expect(lines).toEqual(["n=one: z", "n=other: z"]);
  });

  it("leaves out rows that would need one argument at two values", () => {
    expect(summary("{n, plural, one {{n, selectordinal, one {a} other {b}}} other {c}}")).toEqual([
      "n=one: a",
      "n=other: c",
    ]);
    const lines = summary(
      "{n, plural, one {{n, select, a {{m, select, x {X} other {Y}}} other {z}}} other {w}}",
    );
    expect(lines.some((line) => line.startsWith("m="))).toBe(false);
  });

  it("holds an enclosing argument at its arm even when the caller supplied a sample", () => {
    expect(summary(MESSAGES.outerSelect).slice(2)).toEqual([
      "n=one: She has 1 cat",
      "n=other: She has 2 cats",
    ]);
    const supplied = rowsOf(MESSAGES.outerSelect, "en", { gender: "other", n: 7 });
    expect(supplied.map(textOf)).toEqual([
      "She has 7 cats",
      "They have pets",
      "She has 1 cat",
      "She has 2 cats",
    ]);
  });
});

describe("previewIcuMessage: row selection and flags", () => {
  it("shares the row cap across axes instead of starving later ones", () => {
    const options = Array.from({ length: 30 }, (_unused, index) => `o${index} {v${index}}`).join(
      " ",
    );
    const result = preview(`{s, select, ${options} other {x}} {n, plural, one {# a} other {# b}}`);
    const rows = result.supported && result.valid ? result.rows : [];
    expect(result).toMatchObject({ truncated: true });
    expect(rows).toHaveLength(ICU_PREVIEW_MAX_ROWS);
    expect(rows.filter((row) => row.argument === "n").map((row) => row.category)).toEqual([
      "one",
      "other",
    ]);
    expect(rows.filter((row) => row.argument === "s")).toHaveLength(ICU_PREVIEW_MAX_ROWS - 2);
  });

  it("gives a negative exact arm a row and matches an arm with a leading zero by value", () => {
    const rows = rowsOf("{n, plural, =-1 {minus} =01 {first} one {one} other {other}}");
    expect(rows.map((row) => [row.category, row.sample, textOf(row)])).toEqual([
      ["=-1", -1, "minus"],
      ["=01", 1, "first"],
      ["other", 2, "other"],
    ]);
  });

  it("previews a message under a locale extension the skeleton parser rejects", () => {
    expect(rowsOf("{d, time, ::jmm}", "en-u-nu-bogus")).toHaveLength(1);
  });

  it("counts a nested row in the budget rather than failing the preview", () => {
    const body = "#".repeat(1500);
    const value = `{n, plural, one {${body}} other {${body}}} {m, plural, one {${body}} other {${body}}}`;
    const result = preview(value);
    expect(result).toMatchObject({ valid: true, truncated: true });
    const rows = result.supported && result.valid ? result.rows : [];
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThan(4);
  });
});
