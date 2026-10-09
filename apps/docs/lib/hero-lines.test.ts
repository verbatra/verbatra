import { describe, expect, it } from "vitest";
import de from "../messages/de.json";
import en from "../messages/en.json";
import es from "../messages/es.json";
import fr from "../messages/fr.json";
import { heroLocaleRows } from "./hero-lines";
import { i18n } from "./i18n";

const CATALOGS = { en, de, es, fr } as const;

describe("heroLocaleRows", () => {
  it.each(i18n.languages)(
    "gives the %s page two other locales, each with its catalog's landing.hero.headline",
    (locale) => {
      const rows = heroLocaleRows(locale);
      expect(rows).toHaveLength(2);
      for (const row of rows) {
        expect(row.locale).not.toBe(locale);
        expect(row.headline).toBe(CATALOGS[row.locale].landing.hero.headline);
      }
    },
  );
});
