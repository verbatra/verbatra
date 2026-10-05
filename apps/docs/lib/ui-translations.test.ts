import { uiTranslations } from "fumadocs-ui/i18n";
import { describe, expect, it } from "vitest";
import { i18n } from "@/lib/i18n";
import { LOCALE_DISPLAY_NAMES } from "@/lib/language-select-copy";
import { translations } from "@/lib/layout.shared";
import { type TranslatedLocale, UI_TRANSLATIONS } from "@/lib/ui-translations";

const UI_KEYS = uiTranslations().keys;
const EM_DASH = String.fromCharCode(0x2014);
const TRANSLATED = i18n.languages.filter(
  (locale): locale is TranslatedLocale => locale !== i18n.defaultLanguage,
);
const SAME_AS_ENGLISH: Readonly<Record<TranslatedLocale, ReadonlySet<string>>> = {
  de: new Set(["System(theme switcher)(aria-label)"]),
  es: new Set(),
  fr: new Set(["Type(type table)"]),
};

function englishLabel(key: string): string {
  return key.replace(/(\([^()]*\))+$/, "");
}

describe("fumadocs ui translations", () => {
  it("covers every locale except the default one", () => {
    expect(Object.keys(UI_TRANSLATIONS).sort()).toEqual([...TRANSLATED].sort());
  });

  describe.each(TRANSLATED)("%s", (locale) => {
    const resolved = translations.get(locale);

    it("translates every key fumadocs-ui declares", () => {
      for (const key of UI_KEYS) {
        const value = resolved[key as keyof typeof resolved];
        expect(value, key).toBeTypeOf("string");
        expect(value?.trim(), key).not.toBe("");
      }
    });

    it("does not fall back to the english label", () => {
      for (const key of UI_KEYS) {
        if (key === "displayName" || SAME_AS_ENGLISH[locale].has(key)) continue;
        expect(resolved[key as keyof typeof resolved], key).not.toBe(englishLabel(key));
      }
    });

    it("keeps the url placeholder in the ask-about-page prompt", () => {
      const prompt =
        UI_TRANSLATIONS[locale]["Read {url}, I want to ask questions about it.(page actions)"];
      expect(prompt).toContain("{url}");
    });

    it("names the language the way the language select does", () => {
      expect(UI_TRANSLATIONS[locale].displayName).toBe(LOCALE_DISPLAY_NAMES[locale]);
    });

    it("never uses an em dash", () => {
      expect(Object.values(UI_TRANSLATIONS[locale]).join("\n")).not.toContain(EM_DASH);
    });
  });
});
