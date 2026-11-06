import IntlMessageFormat from "intl-messageformat";
import { describe, expect, it } from "vitest";
import { ICU_MAX_NESTING_DEPTH, ICU_MAX_VALUE_LENGTH } from "./limits.js";
import {
  ICU_MAX_LOCALE_LENGTH,
  ICU_MAX_OUTPUT_LENGTH,
  ICU_MAX_SAMPLE_TEXT,
  ICU_SAMPLE_INSTANT,
  type IcuRenderArguments,
  type IcuSegment,
  renderIcuMessage,
  resolveIcuLocale,
} from "./render.js";

function textOf(segments: readonly IcuSegment[]): string {
  return segments.map((segment) => segment.text).join("");
}

function rendered(value: string, locale: string, args: IcuRenderArguments = {}): string {
  const result = renderIcuMessage(value, locale, args);
  if (!result.valid) {
    throw new Error(`render refused: ${result.reason}`);
  }
  return textOf(result.segments);
}

function refusal(value: string, locale: string, args: IcuRenderArguments = {}): string {
  const result = renderIcuMessage(value, locale, args);
  return result.valid ? "rendered" : result.reason;
}

const TAG_NAMES = ["b", "i", "link"] as const;

function oracle(value: string, locale: string, args: IcuRenderArguments): string {
  const tags = Object.fromEntries(
    TAG_NAMES.map((name) => [
      name,
      (chunks: readonly string[]): string => `<${name}>${chunks.join("")}</${name}>`,
    ]),
  );
  const message = new IntlMessageFormat(value, locale, undefined, {
    formatters: {
      getNumberFormat: (locales, options) =>
        new Intl.NumberFormat(locales, options as Intl.NumberFormatOptions | undefined),
      getPluralRules: (locales, options) => new Intl.PluralRules(locales, options),
      getDateTimeFormat: (locales, options) =>
        new Intl.DateTimeFormat(locales, { ...options, timeZone: "UTC" }),
    },
  });
  const sampleInstant = new Date(ICU_SAMPLE_INSTANT);
  return String(message.format({ d: sampleInstant, ...args, ...tags }));
}

function nested(depth: number): string {
  let value = "x";
  for (let level = 0; level < depth; level += 1) {
    value = `{a, select, other {${value}}}`;
  }
  return value;
}

describe("renderIcuMessage differential against intl-messageformat", () => {
  const PLURAL = "{n, plural, =0 {none} one {# item} other {# items}}";
  const COUNTS = [0, 1, 2, 3, 4, 5, 11, 12, 21, 22, 100, 101, 1.5, 0.5, 1000000, 2000000];
  const LOCALES = ["en", "de", "fr", "es", "ar", "pl", "ru", "he", "cy", "ja", "lv", "sl", "ga"];

  for (const locale of LOCALES) {
    it(`plural with an exact arm in ${locale}`, () => {
      for (const n of COUNTS) {
        expect(rendered(PLURAL, locale, { n })).toBe(oracle(PLURAL, locale, { n }));
      }
    });

    it(`selectordinal in ${locale}`, () => {
      const value = "{n, selectordinal, one {#st} two {#nd} few {#rd} other {#th}}";
      for (const n of COUNTS) {
        expect(rendered(value, locale, { n })).toBe(oracle(value, locale, { n }));
      }
    });
  }

  it("applies offset to category selection and to the pound", () => {
    const value =
      "{n, plural, offset:1 =0 {nobody} =1 {just you} one {you and # other} other {you and # others}}";
    for (const n of [0, 1, 2, 3, 4, 5, 22]) {
      expect(rendered(value, "en", { n })).toBe(oracle(value, "en", { n }));
      expect(rendered(value, "pl", { n })).toBe(oracle(value, "pl", { n }));
    }
  });

  it("renders nested arms with the innermost pound", () => {
    const value =
      "{g, select, f {{n, plural, one {She has # cat} other {She has # cats}}} m {{n, plural, one {He has # cat} other {He has # cats}}} other {{n, plural, one {They have # cat} other {They have # cats}}}}";
    for (const g of ["f", "m", "x", "constructor"]) {
      for (const n of [0, 1, 2, 5]) {
        expect(rendered(value, "en", { g, n })).toBe(oracle(value, "en", { g, n }));
      }
    }
  });

  it("renders a plural inside a plural", () => {
    const value =
      "{p, plural, one {# apple and {q, plural, one {# pear} other {# pears}}} other {# apples and {q, plural, one {# pear} other {# pears}}}}";
    for (const [p, q] of [
      [1, 1],
      [2, 1],
      [1, 5],
      [3, 3],
    ] as const) {
      expect(rendered(value, "en", { p, q })).toBe(oracle(value, "en", { p, q }));
    }
  });

  it("formats numbers in named styles and skeletons", () => {
    const values = [
      "{n, number}",
      "{n, number, integer}",
      "{n, number, percent}",
      "{n, number, ::currency/EUR}",
      "{n, number, ::percent scale/100}",
      "{n, number, ::compact-short}",
      "{n, number, ::.00}",
      "{n, number, unknown-style}",
    ];
    for (const locale of ["en", "de", "ar", "hi", "ja"]) {
      for (const value of values) {
        for (const n of [0, 0.256, 1234.5, -7, 1234567.891]) {
          expect(rendered(value, locale, { n })).toBe(oracle(value, locale, { n }));
        }
      }
    }
  });

  it("formats dates and times in a fixed UTC instant", () => {
    const values = [
      "{d, date}",
      "{d, date, short}",
      "{d, date, medium}",
      "{d, date, long}",
      "{d, date, full}",
      "{d, date, ::yyyyMMdd}",
      "{d, time}",
      "{d, time, short}",
      "{d, time, medium}",
      "{d, time, long}",
      "{d, time, full}",
      "{d, time, ::hhmm}",
      "{d, time, ::jmm}",
      "{d, time, ::Jmm}",
      "{d, time, ::Cmm}",
      "{d, date, ::yMMMd}",
    ];
    for (const locale of ["en", "de", "ar", "ja", "fr", "en-GB", "hi"]) {
      for (const value of values) {
        expect(rendered(value, locale)).toBe(oracle(value, locale, {}));
      }
    }
  });

  it("renders tags as text around their children", () => {
    const values = [
      "<b>bold</b> and <i>{n, plural, one {# x} other {# y}}</i>",
      "<link>{name}</link>!",
      "{n, plural, one {<b>#</b> file} other {<b>#</b> files}}",
    ];
    for (const value of values) {
      expect(rendered(value, "en", { n: 3, name: "Mario" })).toBe(
        oracle(value, "en", { n: 3, name: "Mario" }),
      );
    }
  });

  it("honours apostrophe quoting", () => {
    const values = ["It''s {name}", "'{'name'}' is literal", "'<b>'x'</b>'"];
    for (const value of values) {
      expect(rendered(value, "en", { name: "x" })).toBe(oracle(value, "en", { name: "x" }));
    }
  });
});

describe("renderIcuMessage segments", () => {
  it("tags each run by origin", () => {
    const result = renderIcuMessage(
      "Hi <b>{name}</b>, you have {n, plural, one {# note} other {# notes}}",
      "en",
      {
        name: "Mario",
        n: 2,
      },
    );
    expect(result).toEqual({
      valid: true,
      locale: "en",
      segments: [
        { kind: "text", text: "Hi " },
        { kind: "tag", text: "<b>" },
        { kind: "argument", text: "Mario" },
        { kind: "tag", text: "</b>" },
        { kind: "text", text: ", you have " },
        { kind: "argument", text: "2" },
        { kind: "text", text: " notes" },
      ],
    });
  });

  it("merges adjacent literal runs", () => {
    const result = renderIcuMessage("a'{'b", "en", {});
    expect(result).toEqual({
      valid: true,
      locale: "en",
      segments: [{ kind: "text", text: "a{b" }],
    });
  });

  it("keeps a hostile tag as inert text", () => {
    const result = renderIcuMessage("<script>alert(1)</script>", "en", {});
    expect(result).toEqual({
      valid: true,
      locale: "en",
      segments: [
        { kind: "tag", text: "<script>" },
        { kind: "text", text: "alert(1)" },
        { kind: "tag", text: "</script>" },
      ],
    });
  });

  it("refuses a tag with attributes instead of passing markup through", () => {
    expect(refusal('<img src=x onerror="alert(1)">', "en")).toBe("invalid-message");
    expect(refusal("<b onclick='x'>y</b>", "en")).toBe("invalid-message");
  });

  it("shows an unresolved argument as its placeholder", () => {
    expect(rendered("Hi {name}", "en")).toBe("Hi {name}");
    expect(rendered("{n, number}", "en")).toBe("{n}");
  });

  it("uses the other arm and an unresolved pound when the plural has no count", () => {
    expect(rendered("{n, plural, one {# a} other {# b}}", "en")).toBe("# b");
  });

  it("falls back to other when a select value matches no arm", () => {
    expect(rendered("{s, select, a {A} other {O}}", "en", { s: "zzz" })).toBe("O");
    expect(rendered("{s, select, a {A} other {O}}", "en")).toBe("O");
  });

  it("shows the number as a pound for the innermost plural only", () => {
    expect(rendered("{n, plural, other {# / {s, select, other {#}}}}", "en", { n: 3 })).toBe(
      "3 / #",
    );
  });

  it("formats a pound with the locale's digits and grouping", () => {
    expect(rendered("{n, plural, other {#}}", "de", { n: 1234567.5 })).toBe("1.234.567,5");
  });
});

describe("renderIcuMessage hostile input", () => {
  it("refuses a value over the length cap and accepts one at the cap", () => {
    expect(refusal("a".repeat(ICU_MAX_VALUE_LENGTH + 1), "en")).toBe("too-long");
    expect(refusal("a".repeat(ICU_MAX_VALUE_LENGTH), "en")).toBe("rendered");
  });

  it("refuses nesting past the depth cap and accepts nesting at it", () => {
    const atCap = nested(ICU_MAX_NESTING_DEPTH / 2);
    const pastCap = nested(ICU_MAX_NESTING_DEPTH / 2 + 1);
    expect(refusal(atCap, "en")).toBe("rendered");
    expect(refusal(pastCap, "en")).toBe("too-complex");
  });

  it("refuses a brace flood before parsing it", () => {
    expect(refusal("{".repeat(10_000), "en")).toBe("too-complex");
    expect(refusal("{a}".repeat(300), "en")).toBe("too-complex");
    expect(refusal("{a}".repeat(100), "en")).toBe("rendered");
  });

  it("refuses a tag flood", () => {
    expect(refusal("<b>".repeat(5000), "en")).toBe("too-complex");
    expect(refusal("<b>x</b>".repeat(200), "en")).toBe("too-complex");
  });

  it("refuses an unclosed or malformed message with a structured result", () => {
    for (const value of ["{", "{a", "{a,}", "{a, plural}", "{n, plural, one {x}}", "<b>x", "}{"]) {
      const result = renderIcuMessage(value, "en", {});
      expect(result.valid).toBe(false);
    }
  });

  it("refuses an unusable locale without throwing", () => {
    const locales = [
      "",
      "x".repeat(ICU_MAX_LOCALE_LENGTH + 1),
      "!!!",
      "en US",
      "zz",
      "xx-invalid-1234567890",
      "\u0000",
    ];
    for (const locale of locales) {
      expect(refusal("{n, plural, one {a} other {b}}", locale, { n: 1 })).toBe(
        "unsupported-locale",
      );
    }
  });

  it("refuses a well-formed locale past the length cap", () => {
    const wellFormed = `en-x-${"abcdefgh-".repeat(10)}abcdefgh`;
    expect(wellFormed.length).toBeGreaterThan(ICU_MAX_LOCALE_LENGTH);
    expect(Intl.PluralRules.supportedLocalesOf([wellFormed])).toHaveLength(1);
    expect(resolveIcuLocale(wellFormed)).toBeUndefined();
    expect(
      resolveIcuLocale(wellFormed.slice(0, ICU_MAX_LOCALE_LENGTH - 1).replace(/-$/, "")),
    ).toBeDefined();
  });

  it("accepts an underscore locale and normalises its case", () => {
    expect(resolveIcuLocale("pt_BR")).toBe("pt-BR");
    expect(resolveIcuLocale("EN-us")).toBe("en-US");
  });

  it("copes with non-finite samples", () => {
    const value = "{n, plural, =0 {zero} one {# one} other {# other}}";
    expect(rendered(value, "en", { n: Number.NaN })).toBe("NaN other");
    expect(rendered(value, "en", { n: Number.POSITIVE_INFINITY })).toBe("∞ other");
    expect(rendered(value, "en", { n: Number.NEGATIVE_INFINITY })).toBe("-∞ other");
    expect(rendered("{n, number, ::percent scale/100}", "en", { n: Number.NaN })).toBe("NaN%");
    expect(rendered("{n, selectordinal, other {#th}}", "en", { n: Number.NaN })).toBe("NaNth");
  });

  it("shows the placeholder for a date sample no calendar can hold", () => {
    expect(rendered("{d, date}", "en", { d: Number.NaN })).toBe("{d}");
    expect(rendered("{d, time}", "en", { d: Number.POSITIVE_INFINITY })).toBe("{d}");
    expect(rendered("{d, date}", "en", { d: 8.64e15 + 1 })).toBe("{d}");
  });

  it("uses the fixed UTC instant when a date sample is absent or not a number", () => {
    expect(rendered("{d, date, ::yyyyMMdd}", "en")).toBe("03/15/2024");
    expect(rendered("{d, date, ::yyyyMMdd}", "en", { d: "yesterday" })).toBe("03/15/2024");
    expect(rendered("{d, time, short}", "en")).toBe("2:30 PM");
  });

  it("falls back to a plain number when Intl rejects the skeleton options", () => {
    expect(rendered("{n, number, ::currency}", "en", { n: 1234.5 })).toBe("1,234.5");
    expect(rendered("{n, number, ::unit/not-a-unit}", "en", { n: 3 })).toBe("3");
    expect(
      rendered(
        "{n, number, ::.000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000}",
        "en",
        { n: 3 },
      ),
    ).toBe("3");
  });

  it("does not read inherited or special names from the arguments", () => {
    const inherited = Object.create({ name: "leaked" }) as Record<string, string>;
    expect(rendered("Hi {name}", "en", inherited)).toBe("Hi {name}");
    expect(rendered("{constructor} {toString} {__proto__}", "en", {})).toBe(
      "{constructor} {toString} {__proto__}",
    );
    expect(rendered("{s, select, a {A} other {O}}", "en", { s: "toString" })).toBe("O");
    expect(rendered("{s, select, a {A} other {O}}", "en", { s: "__proto__" })).toBe("O");
    const own = JSON.parse('{"__proto__": "p"}') as Record<string, string>;
    expect(rendered("{__proto__}", "en", own)).toBe("p");
  });

  it("ignores sample values that are neither strings nor numbers", () => {
    const hostile = {
      name: Object.create(null),
      n: { valueOf: () => 1 },
      big: 10n,
      list: [1, 2],
    } as unknown as IcuRenderArguments;
    expect(rendered("{name}|{n, number}|{big}|{list}", "en", hostile)).toBe(
      "{name}|{n}|{big}|{list}",
    );
  });

  it("truncates a long string sample", () => {
    const text = rendered("{a}", "en", { a: "y".repeat(ICU_MAX_SAMPLE_TEXT * 4) });
    expect(text).toHaveLength(ICU_MAX_SAMPLE_TEXT);
  });

  it("refuses output past the output cap instead of building it", () => {
    const value = `{n, plural, other {${"#".repeat(19_000)}}}`;
    expect(refusal(value, "en", { n: 1e20 })).toBe("too-large");
    expect(refusal(value, "en", { n: 1 })).toBe("rendered");
    expect(ICU_MAX_OUTPUT_LENGTH).toBeLessThan(19_000 * 30);
  });

  it("never throws on a mixed hostile corpus", () => {
    const corpus = [
      "",
      "{",
      "}",
      "<",
      "'",
      "{a, plural, offset:99999999999999999999 other {#}}",
      "{a, plural, =99999999999999999999 {x} other {y}}",
      "{a, select, other {{a, select, other {{a, select, other {x}}}}}}",
      "\ud800{a}\udfff",
      "{a, number, ::scale/1e999 percent}",
      "{a, plural, other {#}} {a, selectordinal, other {#}}",
      "😀{n, plural, other {😀#😀}}",
    ];
    for (const value of corpus) {
      for (const locale of ["en", "ar", "x", ""]) {
        expect(() =>
          renderIcuMessage(value, locale, { a: Number.NaN, n: Number.POSITIVE_INFINITY }),
        ).not.toThrow();
      }
    }
  });
});
