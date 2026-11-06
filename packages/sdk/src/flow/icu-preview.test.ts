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

  it("refuses a message with nothing to vary when its text outgrows the budget", () => {
    const value = "{n, number}".repeat(256);
    expect(refusalOf(value, "en", { n: 1e308 })).toBe("too-large");
    expect(refusalOf(value, "en", { n: 1 })).toBeUndefined();
  });

  it("returns a sample for every row it builds", () => {
    const values = [
      "{n, plural, one {a} other {b}}",
      "{g, select, f {F} other {O}} {n, plural, =0 {z} other {#}}",
      "{a, select, x {{n, plural, one {A} other {Ao}}} other {z}}",
    ];
    for (const value of values) {
      expect(rowsOf(value).every((row) => row.sample !== null && row.sample !== undefined)).toBe(
        true,
      );
    }
  });

  it("renders the Unix epoch in UTC when a number sets the instant", () => {
    expect(textOf(rowsOf("{d, date, ::yyyyMMdd}", "en", { d: 0 })[0] as IcuPreviewRow)).toBe(
      "01/01/1970",
    );
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
      "She have 9 cats",
      "She have 1 cat",
      "She have 2 cats",
      "She have 9 cats",
    ]);
  });

  it("returns one row for a message with nothing to vary", () => {
    expect(rowsOf("Hi {name}", "en", { name: "Mario" })).toEqual([
      {
        axis: "none",
        argument: null,
        category: null,
        sample: null,
        held: {},
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

  it("gives an argument with several parents a row for each arm occurrence", () => {
    const lines = summary(
      "{a, select, x {{g, select, f {F1} other {O1}}} y {{g, select, f {F2} m {M2} other {O2}}} other {z}}",
    );
    expect(lines.filter((line) => line.startsWith("g="))).toEqual([
      "g=f: F1",
      "g=f: F2",
      "g=other: O1",
      "g=other: O2",
      "g=m: M2",
    ]);
  });

  it("shows every arm of a nested plural under each parent arm", () => {
    expect(
      summary(
        "{g, select, female {{n, plural, one {F1} other {Fo}}} male {{n, plural, one {M1} other {Mo}}} other {X}}",
      ),
    ).toEqual([
      "g=female: Fo",
      "g=male: Mo",
      "g=other: X",
      "n=one: F1",
      "n=one: M1",
      "n=other: Fo",
      "n=other: Mo",
    ]);
  });

  it("collapses rows whose text repeats an earlier row with the same label", () => {
    const lines = summary(
      "{a, select, x {{g, select, f {same} other {O}}} y {{g, select, f {same} other {O}}} other {z}}",
    );
    expect(lines.filter((line) => line.startsWith("g="))).toEqual(["g=f: same", "g=other: O"]);
  });

  it("shows an exact arm under the occurrence that holds it", () => {
    const lines = summary(
      "{a, select, x {{n, plural, one {A} other {Ao}}} y {{n, plural, =0 {zero} one {B} other {Bo}}} other {z}}",
    );
    expect(lines.filter((line) => line.startsWith("n="))).toEqual([
      "n==0: zero",
      "n=one: A",
      "n=one: B",
      "n=other: Ao",
      "n=other: Bo",
    ]);
  });

  it("leaves out rows whose enclosing arm this locale can never select", () => {
    const lines = summary("{n, plural, few {{g, select, f {x} other {y}}} other {z}}");
    expect(lines).toEqual(["n=one: z", "n=other: z"]);
  });

  it("lets a row sit under an enclosing arm of its own argument when one sample selects both", () => {
    expect(
      summary("{count, plural, =0 {none} other {{count, plural, one {# item} other {# items}}}}"),
    ).toEqual(["count==0: none", "count=one: 1 item", "count=other: 2 items"]);
    const ordinals = summary(
      "{n, plural, =0 {none} other {{n, selectordinal, one {#st} two {#nd} few {#rd} other {#th}}}}",
    );
    expect(ordinals).toEqual([
      "n==0: none",
      "n=one: 1st",
      "n=other: 2nd",
      "n=one: 1st",
      "n=two: 2nd",
      "n=few: 3rd",
      "n=other: 4th",
    ]);
    const result = preview(
      "{count, plural, =0 {none} other {{count, plural, one {#} other {##}}}}",
    );
    expect(result).toMatchObject({ truncated: false });
  });

  it("resolves each held sample against its own occurrence's offset", () => {
    expect(
      summary(
        "{n, plural, offset:1 one {A} other {B}} {n, plural, offset:2 one {{g, select, x {GX} other {GY}}} other {C}}",
      ),
    ).toEqual([
      "n=one: A C",
      "n=one: B GY",
      "n=other: B GY",
      "n=other: B C",
      "g=x: B GX",
      "g=other: B GY",
    ]);
  });

  it("does not flag arms no input can reach", () => {
    const value = "{n, plural, one {{n, select, x {a} other {b}}} other {c}}";
    expect(preview(value)).toMatchObject({ valid: true, truncated: false });
    expect(summary(value)).toEqual(["n=one: b", "n=other: c", "n=other: b"]);
    const nested =
      "{n, plural, one {{n, select, a {{m, select, x {X} other {Y}}} other {z}}} other {w}}";
    expect(preview(nested)).toMatchObject({ truncated: false });
    expect(summary(nested).some((line) => line.startsWith("m="))).toBe(false);
  });

  it("gives a category row only under the occurrences that write the category", () => {
    const lines = summary(
      "{a, select, x {{n, plural, one {A} other {Ao}}} y {{n, plural, other {Bo}}} other {z}}",
    );
    expect(lines.filter((line) => line.startsWith("n="))).toEqual([
      "n=one: A",
      "n=other: Ao",
      "n=other: Bo",
    ]);
  });

  it("gives a category no occurrence writes a single row", () => {
    const lines = summary(
      "{a, select, x {{n, plural, one {A} other {Ao}}} y {{n, plural, one {B} other {Bo}}} other {z}}",
      "pl",
    );
    expect(lines.filter((line) => line.startsWith("n=few"))).toEqual(["n=few: Ao"]);
  });

  it("reaches an other arm that a named-away category falls into", () => {
    const lines = summary("{c, plural, =21 {{c, selectordinal, zero {z} other {oth}}} other {x}}");
    expect(lines).toContain("c=other: oth");
  });

  it("reaches a select under a plural with a string value", () => {
    const lines = summary("{n, plural, other {{n, select, x {X} other {Y}}}}");
    expect(lines).toContain("n=x: X");
  });

  it("answers truncated false when an exact arm or the locale leaves an arm unreachable", () => {
    const cases: readonly (readonly [string, string])[] = [
      ["ar", "{n, plural, =0 {z} zero {zz} one {o} two {t} few {f} many {m} other {x}}"],
      ["cy", "{n, plural, =0 {z} zero {zz} one {o} two {t} few {f} many {m} other {x}}"],
      ["en", "{n, plural, =1 {exact} one {# one} other {# other}}"],
      ["en", "{n, plural, =5 {five} other {#}}"],
      ["en", "{g, select, female {{n, plural, few {F} other {Fo}}} other {X}}"],
    ];
    for (const [locale, value] of cases) {
      expect(preview(value, locale), `${locale} ${value}`).toMatchObject({ truncated: false });
    }
  });

  it("shows the singular category when the offset puts it below the first count", () => {
    const lines = summary(
      "{n, plural, offset:1 =1 {You} =2 {You and X} one {You and # other} other {You and # others}}",
    );
    expect(lines).toContain("n=one: You and -1 other");
  });

  it("holds a whole default beside a number use of the same argument", () => {
    const lines = summary(
      "{count, number} {count, plural, one {item} other {items}} {g, select, f {F} other {O}}",
    );
    expect(lines.filter((line) => line.startsWith("g="))).toEqual([
      "g=f: 2 items F",
      "g=other: 2 items O",
    ]);
  });

  it("does not report a row whose enclosing arm the locale can never select", () => {
    const result = preview("{n, plural, few {{g, select, f {x} other {y}}} other {z}}");
    expect(result).toMatchObject({ valid: true, truncated: false });
  });

  it("does not report an arm an exact arm always intercepts", () => {
    expect(preview("{n, plural, =1 {exact} one {# one} other {# other}}")).toMatchObject({
      truncated: false,
    });
  });

  it("keeps a held default plural sample off its exact arms", () => {
    const lines = summary("{n, plural, =2 {two} other {# x}} {g, select, f {F} other {O}}");
    expect(lines.filter((line) => line.startsWith("g="))).toEqual(["g=f: 3 x F", "g=other: 3 x O"]);
  });

  it("holds default plural samples at a whole number so a select row reads naturally", () => {
    const lines = summary(
      "{n, plural, one {# kot} few {# koty} many {# kotow} other {# kota}} {g, select, f {F} other {O}}",
      "pl",
    );
    expect(lines.filter((line) => line.startsWith("g="))).toEqual([
      "g=f: 2 koty F",
      "g=other: 2 koty O",
    ]);
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
      "They have pets",
      "She has 1 cat",
      "She has 2 cats",
      "She has 7 cats",
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

  it("spends the row cap on each label once before repeating a label", () => {
    const parents = Array.from(
      { length: 14 },
      (_unused, index) => `p${index} {{n, plural, one {One${index}} other {Many${index}}}}`,
    ).join(" ");
    const result = preview(`{a, select, ${parents} other {z}}`);
    const rows = result.supported && result.valid ? result.rows : [];
    expect(result).toMatchObject({ truncated: true });
    expect(rows).toHaveLength(ICU_PREVIEW_MAX_ROWS);
    const categories = new Set(
      rows.filter((row) => row.argument === "n").map((row) => row.category),
    );
    expect(categories).toEqual(new Set(["one", "other"]));
  });

  it("gives a negative exact arm a row", () => {
    const rows = rowsOf("{n, plural, =-1 {minus} one {one} other {other}}");
    expect(rows.map((row) => [row.category, row.sample, textOf(row)])).toEqual([
      ["=-1", -1, "minus"],
      ["one", 1, "one"],
      ["other", 2, "other"],
    ]);
  });

  it("gives a non-canonical exact arm no row and lets its value reach the real arm", () => {
    for (const selector of ["=01", "=+1", "=-0"]) {
      const rows = rowsOf(`{n, plural, ${selector} {odd} one {one} other {other}}`);
      expect(rows.map((row) => row.category)).toEqual(["one", "other"]);
      expect(rows.map(textOf)).toEqual(["one", "other"]);
    }
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
