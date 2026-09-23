import type { LocaleResource, TranslationEntry } from "@verbatra/core";
import { describe, expect, it } from "vitest";
import {
  detectMissingPluralCategories,
  planPluralGeneration,
  targetPluralSetIncomplete,
} from "./plural-categories.js";

function entry(key: string): TranslationEntry {
  return { key, namespace: "", value: "v", placeholders: [], isPlural: true };
}

function source(keys: readonly string[], format = "i18next-json"): LocaleResource {
  return {
    locale: "en",
    namespace: "",
    format: format as LocaleResource["format"],
    entries: new Map(keys.map((key) => [key, entry(key)])),
  };
}

function entryWith(key: string, value: string, placeholders: readonly string[]): TranslationEntry {
  return { key, namespace: "", value, placeholders, isPlural: true };
}

function sourceWith(entries: readonly TranslationEntry[]): LocaleResource {
  return {
    locale: "en",
    namespace: "",
    format: "i18next-json",
    entries: new Map(entries.map((e) => [e.key, e])),
  };
}

describe("detectMissingPluralCategories", () => {
  it("warns for Arabic when the source supplies only one/other", () => {
    const notice = detectMissingPluralCategories(
      source(["item_one", "item_other"]),
      "ar",
      "i18next-json",
    );
    expect(notice?.code).toBe("PLURAL_CATEGORIES_INCOMPLETE");
    expect(notice?.message).toContain("ar");
    expect(notice?.message).toContain("zero");
  });

  it("warns for Polish when the source supplies only one/other", () => {
    const notice = detectMissingPluralCategories(
      source(["item_one", "item_other"]),
      "pl",
      "i18next-json",
    );
    expect(notice?.code).toBe("PLURAL_CATEGORIES_INCOMPLETE");
    expect(notice?.message).toContain("pl");
    expect(notice?.message).toContain("few");
  });

  it("warns for Russian using a region-tagged locale (ru-RU)", () => {
    const notice = detectMissingPluralCategories(
      source(["item_one", "item_other"]),
      "ru-RU",
      "i18next-json",
    );
    expect(notice?.code).toBe("PLURAL_CATEGORIES_INCOMPLETE");
  });

  it("does not warn for German (one/other suffices)", () => {
    expect(
      detectMissingPluralCategories(source(["item_one", "item_other"]), "de", "i18next-json"),
    ).toBeUndefined();
  });

  it("does not warn when the source already supplies every required category", () => {
    const all = source([
      "item_zero",
      "item_one",
      "item_two",
      "item_few",
      "item_many",
      "item_other",
    ]);
    expect(detectMissingPluralCategories(all, "ar", "i18next-json")).toBeUndefined();
  });

  it("does not warn when the source has no plural keys at all", () => {
    expect(
      detectMissingPluralCategories(source(["greeting", "farewell"]), "ar", "i18next-json"),
    ).toBeUndefined();
  });

  it("is a no-op for non-i18next formats (no per-category source keys)", () => {
    expect(
      detectMissingPluralCategories(
        source(["item_one", "item_other"], "vue-i18n-json"),
        "ar",
        "vue-i18n-json",
      ),
    ).toBeUndefined();
  });
});

describe("planPluralGeneration: representative source form (divergent placeholders)", () => {
  it("draws every generated form from the _other form when categories diverge", () => {
    const src = sourceWith([
      entryWith("items_one", "{{count}} {{unit}}", ["{{count}}", "{{unit}}"]),
      entryWith("items_other", "{{count}} items", ["{{count}}"]),
    ]);

    const plan = planPluralGeneration(src, "pl", "i18next-json");

    expect(plan.items.map((i) => i.targetKey)).toEqual(["items_few", "items_many"]);
    for (const item of plan.items) {
      expect(item.sourceEntry.key).toBe("items_other");
      expect(item.sourceEntry.placeholders).toEqual(["{{count}}"]);
    }
  });

  it("falls back to the _one form as representative when _other is absent", () => {
    const src = sourceWith([
      entryWith("items_one", "{{count}} {{unit}}", ["{{count}}", "{{unit}}"]),
    ]);

    const plan = planPluralGeneration(src, "pl", "i18next-json");

    expect(plan.items.length).toBeGreaterThan(0);
    for (const item of plan.items) {
      expect(item.sourceEntry.key).toBe("items_one");
      expect(item.sourceEntry.placeholders).toEqual(["{{count}}", "{{unit}}"]);
    }
  });
});

describe("plural categories: CLDR-correct set per target language", () => {
  const englishSource = ["item_one", "item_other"];

  it.each([
    ["ar", ["zero", "two", "few", "many"]],
    ["cy", ["zero", "two", "few", "many"]],
    ["he", ["two"]],
    ["cs", ["few", "many"]],
    ["sk", ["few", "many"]],
    ["ro", ["few"]],
    ["pl", ["few", "many"]],
    ["ru", ["few", "many"]],
    ["fr", ["many"]],
  ])("flags and plans the missing %s categories %j", (locale, missing) => {
    const notice = detectMissingPluralCategories(source(englishSource), locale, "i18next-json");
    expect(notice?.code).toBe("PLURAL_CATEGORIES_INCOMPLETE");
    expect(notice?.message).toContain(`(missing: ${missing.join(", ")})`);

    const plan = planPluralGeneration(source(englishSource), locale, "i18next-json");
    expect(plan.items.map((item) => item.category)).toEqual(missing);
  });

  it.each(["ja", "zh", "ko", "en", "de"])(
    "neither flags nor plans anything for %s from a one/other source",
    (locale) => {
      expect(
        detectMissingPluralCategories(source(englishSource), locale, "i18next-json"),
      ).toBeUndefined();
      expect(planPluralGeneration(source(englishSource), locale, "i18next-json").items).toEqual([]);
    },
  );

  it("reports a Japanese target set holding only _other as complete", () => {
    expect(targetPluralSetIncomplete(["item_other"], "ja")).toBe(false);
  });

  it("reports a French target set lacking _many as incomplete", () => {
    expect(targetPluralSetIncomplete(["item_one", "item_other"], "fr")).toBe(true);
    expect(targetPluralSetIncomplete(["item_one", "item_many", "item_other"], "fr")).toBe(false);
  });

  it("plans the missing _one form for a CLDR-known one/other language", () => {
    const plan = planPluralGeneration(source(["item_other"]), "de", "i18next-json");
    expect(plan.items.map((item) => item.targetKey)).toEqual(["item_one"]);
  });

  it("falls back to one/other for a locale ICU does not know and plans nothing", () => {
    const notice = detectMissingPluralCategories(source(["item_other"]), "tlh", "i18next-json");
    expect(notice?.message).toContain("(missing: one)");
    expect(planPluralGeneration(source(["item_other"]), "tlh", "i18next-json").items).toEqual([]);
    expect(targetPluralSetIncomplete(["item_one", "item_other"], "tlh")).toBe(false);
  });
});
