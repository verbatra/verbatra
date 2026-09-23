import { describe, expect, it } from "vitest";
import { PLURAL_CATEGORIES } from "./plural-category.js";

describe("PLURAL_CATEGORIES", () => {
  it("lists the six CLDR keywords in canonical order", () => {
    expect(PLURAL_CATEGORIES).toEqual(["zero", "one", "two", "few", "many", "other"]);
  });

  it.each([
    ["ar", "cardinal"],
    ["cy", "cardinal"],
    ["ru", "cardinal"],
    ["en", "ordinal"],
    ["cy", "ordinal"],
  ] as const)("covers every category the runtime reports for %s %s", (locale, type) => {
    const reported = new Intl.PluralRules(locale, { type }).resolvedOptions().pluralCategories;
    expect(
      reported.every((category) => (PLURAL_CATEGORIES as readonly string[]).includes(category)),
    ).toBe(true);
  });
});
