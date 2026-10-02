import type { FormatId, LocaleResource, TranslationEntry } from "@verbatra/core";
import { describe, expect, it } from "vitest";
import { icuPluralUses } from "./icu/plural-uses.js";
import { pluralFormSets, tracksPluralCategories } from "./plural-forms.js";

function resource(entries: Record<string, string>, isPlural = true): LocaleResource {
  const map = new Map<string, TranslationEntry>(
    Object.entries(entries).map(([key, value]) => [
      key,
      { key, namespace: "", value, placeholders: [], isPlural },
    ]),
  );
  return { locale: "pl", namespace: "", format: "i18next-json", entries: map };
}

describe("pluralFormSets", () => {
  it("groups i18next suffix keys by base key and reads _ordinal as ordinal", () => {
    const sets = pluralFormSets(
      "i18next-json",
      resource({ n_one: "1", n_other: "n", place_ordinal_one: "1st", place_ordinal_other: "nth" }),
    );
    expect(sets).toEqual([
      { key: "n", ruleType: "cardinal", categories: ["one", "other"] },
      { key: "place_ordinal", ruleType: "ordinal", categories: ["one", "other"] },
    ]);
  });

  it.each(["apple-strings", "apple-xcstrings"] as const)(
    "%s: reads every suffix plural as cardinal and skips singular entries",
    (format) => {
      const plural = resource({ rank_ordinal_one: "1", rank_ordinal_other: "n" });
      const singular = resource({ title_one: "x" }, false);
      expect(pluralFormSets(format, plural)).toEqual([
        { key: "rank_ordinal", ruleType: "cardinal", categories: ["one", "other"] },
      ]);
      expect(pluralFormSets(format, singular)).toEqual([]);
    },
  );

  it("reads Android quantity keys", () => {
    expect(
      pluralFormSets("android-xml", resource({ "files[one]": "1", "files[few]": "f" })),
    ).toEqual([{ key: "files", ruleType: "cardinal", categories: ["one", "few"] }]);
  });

  it.each(["next-intl-json", "arb"] as const)(
    "%s: reads each ICU plural and selectordinal with its argument",
    (format) => {
      const sets = pluralFormSets(
        format,
        resource({
          msg: "{n, plural, =0 {none} one {#} other {#}} {p, selectordinal, one {#st} other {#th}}",
        }),
      );
      expect(sets).toEqual([
        { key: "msg", argument: "n", ruleType: "cardinal", categories: ["one", "other"] },
        { key: "msg", argument: "p", ruleType: "ordinal", categories: ["one", "other"] },
      ]);
    },
  );

  it.each([
    "vue-i18n-json",
    "gettext-po",
    "xliff",
    "properties",
    "custom:hocon",
  ] as const satisfies readonly FormatId[])("%s: tracks no plural categories", (format) => {
    expect(tracksPluralCategories(format)).toBe(false);
    expect(pluralFormSets(format, resource({ n_one: "{n, plural, other {#}}" }))).toEqual([]);
  });

  it("tracks plural categories for the key-encoded and ICU formats", () => {
    const tracked = [
      "i18next-json",
      "apple-strings",
      "apple-xcstrings",
      "android-xml",
      "next-intl-json",
      "arb",
    ] as const;
    expect(tracked.every(tracksPluralCategories)).toBe(true);
  });
});

describe("icuPluralUses", () => {
  it("finds plurals nested in select arms and tags, one use per occurrence", () => {
    const value =
      "<b>{g, select, female {{n, plural, one {#} few {#} other {#}}} other {{n, plural, other {#}}}}</b>";
    expect(icuPluralUses(value)).toEqual([
      { argument: "n", ruleType: "cardinal", categories: ["one", "few", "other"] },
      { argument: "n", ruleType: "cardinal", categories: ["other"] },
    ]);
  });

  it("finds a plural nested inside another plural's arm", () => {
    const value = "{a, plural, one {{b, plural, one {#} other {#}}} other {#}}";
    expect(icuPluralUses(value).map((use) => use.argument)).toEqual(["a", "b"]);
  });

  it("returns nothing for plain text or an unparseable message", () => {
    expect(icuPluralUses("no arguments here")).toEqual([]);
    expect(icuPluralUses("{n, plural, one {#}")).toEqual([]);
  });
});
