import { PLURAL_CATEGORIES } from "@verbatra/core";
import { describe, expect, it } from "vitest";
import type { PluralCategoryLookup } from "../shell.js";
import { compareIcuBranchArms } from "./branch-arms.js";

function cldr(locale: string): PluralCategoryLookup {
  return (type) => {
    const reported = new Set<string>(
      new Intl.PluralRules(locale, { type }).resolvedOptions().pluralCategories,
    );
    return PLURAL_CATEGORIES.filter((category) => reported.has(category));
  };
}

const noRules: PluralCategoryLookup = () => undefined;

const EN_FILES = "{n, plural, one {# file} other {# files}}";

describe("compareIcuBranchArms: plural arms follow the target language's CLDR categories", () => {
  it.each([
    ["ru", "{n, plural, one {# файл} few {# файла} many {# файлов} other {# файла}}"],
    ["pl", "{n, plural, one {# plik} few {# pliki} many {# plików} other {# pliku}}"],
    ["cs", "{n, plural, one {# soubor} few {# soubory} many {# souboru} other {# souborů}}"],
    ["fr", "{n, plural, one {# fichier} many {# de fichiers} other {# fichiers}}"],
    ["ja", "{n, plural, other {# 個のファイル}}"],
    ["de", "{n, plural, one {# Datei} other {# Dateien}}"],
    [
      "ar",
      "{n, plural, zero {لا ملفات} one {ملف} two {ملفان} few {# ملفات} many {# ملفًا} other {# ملف}}",
    ],
    [
      "cy",
      "{n, plural, zero {# ffeil} one {# ffeil} two {# ffeil} few {# ffeil} many {# ffeil} other {# ffeil}}",
    ],
  ])("accepts an English source rendered with exactly the %s arms", (locale, target) => {
    expect(compareIcuBranchArms(EN_FILES, target, cldr(locale))).toEqual([]);
  });

  it("refuses a Russian target that keeps only the English one and other arms", () => {
    const target = "{n, plural, one {# файл} other {# файла}}";

    expect(compareIcuBranchArms(EN_FILES, target, cldr("ru"))).toEqual([
      '{n} plural: missing arm "few" required by the target language',
      '{n} plural: missing arm "many" required by the target language',
    ]);
  });

  it.each([
    ["ar", ["zero", "two", "few", "many"]],
    ["cy", ["zero", "two", "few", "many"]],
    ["pl", ["few", "many"]],
  ])("names every arm %s still needs", (locale, missing) => {
    const target = "{n, plural, one {# x} other {# y}}";

    expect(compareIcuBranchArms(EN_FILES, target, cldr(locale))).toEqual(
      missing.map((arm) => `{n} plural: missing arm "${arm}" required by the target language`),
    );
  });

  it("refuses a Japanese target that keeps a one arm Japanese never selects", () => {
    const target = "{n, plural, one {# 個} other {# 個}}";

    expect(compareIcuBranchArms(EN_FILES, target, cldr("ja"))).toEqual([
      '{n} plural: arm "one" is not a plural category of the target language',
    ]);
  });

  it("refuses a keyword that is no CLDR category at all", () => {
    const target = "{n, plural, one {# Datei} lots {# Dateien} other {# Dateien}}";

    expect(compareIcuBranchArms(EN_FILES, target, cldr("de"))).toEqual([
      '{n} plural: arm "lots" is not a plural category of the target language',
    ]);
  });

  it("treats an arm named like an Object property as an ordinary unknown keyword", () => {
    const target = "{n, plural, one {# Datei} constructor {# x} other {# Dateien}}";

    expect(compareIcuBranchArms(EN_FILES, target, cldr("de"))).toEqual([
      '{n} plural: arm "constructor" is not a plural category of the target language',
    ]);
  });
});

describe("compareIcuBranchArms: exact-value arms and offset", () => {
  const SOURCE = "{n, plural, =0 {no files} =1 {one file} one {# file} other {# files}}";

  it("keeps the source's exact-value arms in a Japanese target that has only other", () => {
    const target = "{n, plural, =0 {ファイルなし} =1 {1 個} other {# 個}}";

    expect(compareIcuBranchArms(SOURCE, target, cldr("ja"))).toEqual([]);
  });

  it("refuses a target that drops an exact-value arm of the source", () => {
    const target = "{n, plural, =1 {1 個} other {# 個}}";

    expect(compareIcuBranchArms(SOURCE, target, cldr("ja"))).toEqual([
      '{n} plural: missing exact-value arm "=0"',
    ]);
  });

  it("accepts exact-value arms the target adds", () => {
    const target = "{n, plural, =0 {keine} =1 {eine} =2 {zwei} one {# Datei} other {# Dateien}}";

    expect(compareIcuBranchArms(SOURCE, target, cldr("de"))).toEqual([]);
  });

  it("does not count an exact-value arm as the required category it overlaps", () => {
    const target = "{n, plural, =0 {keine} =1 {eine} other {# Dateien}}";

    expect(compareIcuBranchArms(SOURCE, target, cldr("de"))).toEqual([
      '{n} plural: missing arm "one" required by the target language',
    ]);
  });

  it("accepts an unchanged offset and refuses a changed one", () => {
    const source =
      "{n, plural, offset:1 =0 {nobody} one {you and # other} other {you and # others}}";
    const kept = "{n, plural, offset:1 =0 {niemand} one {du und # andere} other {du und # andere}}";
    const dropped = "{n, plural, =0 {niemand} one {du und # andere} other {du und # andere}}";

    expect(compareIcuBranchArms(source, kept, cldr("de"))).toEqual([]);
    expect(compareIcuBranchArms(source, dropped, cldr("de"))).toEqual([
      "{n} plural: offset 1 became 0",
    ]);
  });
});

describe("compareIcuBranchArms: selectordinal uses the ordinal categories", () => {
  const SOURCE = "{n, selectordinal, one {#st} two {#nd} few {#rd} other {#th}}";

  it("accepts a French target with French ordinal arms only", () => {
    expect(
      compareIcuBranchArms(SOURCE, "{n, selectordinal, one {#er} other {#e}}", cldr("fr")),
    ).toEqual([]);
  });

  it("refuses a French target that keeps the English two and few arms", () => {
    expect(compareIcuBranchArms(SOURCE, SOURCE, cldr("fr"))).toEqual([
      '{n} selectordinal: arm "two" is not a plural category of the target language',
      '{n} selectordinal: arm "few" is not a plural category of the target language',
    ]);
  });

  it("requires every Welsh ordinal arm", () => {
    const target = "{n, selectordinal, one {#af} other {#fed}}";

    expect(compareIcuBranchArms(SOURCE, target, cldr("cy"))).toEqual([
      '{n} selectordinal: missing arm "zero" required by the target language',
      '{n} selectordinal: missing arm "two" required by the target language',
      '{n} selectordinal: missing arm "few" required by the target language',
      '{n} selectordinal: missing arm "many" required by the target language',
    ]);
  });

  it("does not hold a cardinal plural to the ordinal categories", () => {
    const target = "{n, plural, one {# Datei} other {# Dateien}}";

    expect(
      compareIcuBranchArms(EN_FILES, target, (type) =>
        type === "ordinal" ? ["other"] : ["one", "other"],
      ),
    ).toEqual([]);
  });
});

describe("compareIcuBranchArms: select arms stay the source's", () => {
  const SOURCE = "{gender, select, female {She} male {He} other {They}}";

  it("accepts the same arm set in any order", () => {
    expect(
      compareIcuBranchArms(
        SOURCE,
        "{gender, select, male {Er} other {Sie} female {Sie}}",
        cldr("de"),
      ),
    ).toEqual([]);
  });

  it("refuses a dropped and an invented select arm", () => {
    const target = "{gender, select, female {Sie} neuter {Es} other {Sie}}";

    expect(compareIcuBranchArms(SOURCE, target, cldr("de"))).toEqual([
      '{gender} select: missing arm "male"',
      '{gender} select: arm "neuter" is not in the source',
    ]);
  });

  it("does not apply plural categories to select keys", () => {
    const source = "{kind, select, few {a few} other {some}}";

    expect(
      compareIcuBranchArms(source, "{kind, select, few {kilka} other {trochę}}", cldr("ja")),
    ).toEqual([]);
  });
});

describe("compareIcuBranchArms: nested branches", () => {
  it("checks a plural nested in each select arm", () => {
    const source =
      "{gender, select, female {{n, plural, one {her # file} other {her # files}}} other {{n, plural, one {their # file} other {their # files}}}}";
    const target =
      "{gender, select, female {{n, plural, one {её # файл} few {её # файла} many {её # файлов} other {её # файла}}} other {{n, plural, one {# файл} other {# файла}}}}";

    expect(compareIcuBranchArms(source, target, cldr("ru"))).toEqual([
      '{n} plural: missing arm "few" required by the target language',
      '{n} plural: missing arm "many" required by the target language',
    ]);
  });

  it("checks a plural nested inside an arm the target added, against the source's other arm", () => {
    const source =
      "{a, plural, one {{b, plural, one {# x} other {# xs}}} other {{b, plural, one {# y} other {# ys}}}}";
    const inner = "{b, plural, one {# y} few {# y} many {# y} other {# y}}";
    const target = `{a, plural, one {${inner}} few {${inner}} many {{b, plural, one {# y} other {# y}}} other {${inner}}}`;

    expect(compareIcuBranchArms(source, target, cldr("ru"))).toEqual([
      '{b} plural: missing arm "few" required by the target language',
      '{b} plural: missing arm "many" required by the target language',
    ]);
  });

  it("reports a problem repeated in several arms once", () => {
    const source =
      "{a, select, x {{n, plural, one {#} other {#}}} y {{n, plural, one {#} other {#}}} other {{n, plural, one {#} other {#}}}}";
    const target =
      "{a, select, x {{n, plural, one {#} other {#}}} y {{n, plural, one {#} other {#}}} other {{n, plural, one {#} other {#}}}}";

    expect(compareIcuBranchArms(source, target, cldr("ru"))).toHaveLength(2);
  });

  it("checks a plural wrapped in a rich-text tag", () => {
    const source = "<b>{n, plural, one {# file} other {# files}}</b>";
    const target = "<b>{n, plural, one {# файл} other {# файла}}</b>";

    expect(compareIcuBranchArms(source, target, cldr("ru"))).toHaveLength(2);
  });

  it("ignores a source branch the target no longer carries, leaving it to the placeholder check", () => {
    expect(compareIcuBranchArms(EN_FILES, "Dateien", cldr("de"))).toEqual([]);
  });
});

describe("compareIcuBranchArms: kind changes and edge cases", () => {
  it("refuses a plural that became a select", () => {
    const target = "{n, select, one {# Datei} other {# Dateien}}";

    expect(compareIcuBranchArms(EN_FILES, target, cldr("de"))).toEqual([
      "{n} plural: became a select",
    ]);
  });

  it("refuses a selectordinal that became a cardinal plural", () => {
    const source = "{n, selectordinal, one {#st} other {#th}}";

    expect(compareIcuBranchArms(source, "{n, plural, other {#.}}", cldr("de"))).toEqual([
      "{n} selectordinal: became a plural",
    ]);
  });

  it("pairs each branch with the same-kind branch of its argument when the target swaps their order", () => {
    const source =
      "{n, plural, one {# file} other {# files}} {n, selectordinal, one {#st} other {#th}}";
    const target = "{n, selectordinal, other {#.}} {n, plural, one {# Datei} other {# Dateien}}";

    expect(compareIcuBranchArms(source, target, cldr("de"))).toEqual([]);
  });

  it("still reports a kind change when the argument has no same-kind branch left", () => {
    const source =
      "{n, plural, one {# file} other {# files}} {n, selectordinal, one {#st} other {#th}}";
    const target = "{n, selectordinal, other {#.}} {n, selectordinal, other {#.}}";

    expect(compareIcuBranchArms(source, target, cldr("de"))).toEqual([
      "{n} plural: became a selectordinal",
    ]);
  });

  it("requires only other and accepts any CLDR keyword when the language has no plural rules", () => {
    const target = "{n, plural, one {# a} few {# b} other {# c}}";

    expect(compareIcuBranchArms(EN_FILES, target, noRules)).toEqual([]);
    expect(compareIcuBranchArms(EN_FILES, "{n, plural, lots {#} other {#}}", noRules)).toEqual([
      '{n} plural: arm "lots" is not a plural category of the target language',
    ]);
  });

  it.each([
    ["an unparseable source", "{n, plural, one {#}", "{n, plural, other {#}}"],
    ["an unparseable target", EN_FILES, "{n, plural, one {#}"],
  ])("reports nothing for %s", (_label, source, target) => {
    expect(compareIcuBranchArms(source, target, cldr("ru"))).toEqual([]);
  });

  it("reports nothing for plain text", () => {
    expect(compareIcuBranchArms("Save", "Speichern", cldr("ru"))).toEqual([]);
  });
});
