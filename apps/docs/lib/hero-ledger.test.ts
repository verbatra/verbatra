import { readFileSync } from "node:fs";
import { contentHash } from "@verbatra/core/pure";
import { describe, expect, it } from "vitest";
import de from "../messages/de.json";
import en from "../messages/en.json";
import es from "../messages/es.json";
import fr from "../messages/fr.json";
import {
  HERO_HEADLINE_KEY,
  HERO_HEADLINE_LOCK_HASH,
  heroLocaleRows,
  ledgerRows,
} from "./hero-ledger";
import { i18n } from "./i18n";

const CATALOGS = { en, de, es, fr } as const;

const LOCK = JSON.parse(
  readFileSync(new URL("../verbatra.lock.json", import.meta.url), "utf8"),
) as {
  locales: Record<string, Record<string, string>>;
};

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

describe("ledgerRows", () => {
  it.each(i18n.languages)(
    "on %s, lists the source file first and then every target catalog once",
    (locale) => {
      const rows = ledgerRows(locale);
      expect(rows.map((row) => row.locale).sort()).toEqual([...i18n.languages].sort());
      expect(rows[0]).toEqual({
        locale: "en",
        file: "messages/en.json",
        value: en.landing.hero.headline,
        source: true,
      });
      for (const row of rows) {
        expect(row.file).toBe(`messages/${row.locale}.json`);
        expect(row.value).toBe(CATALOGS[row.locale].landing.hero.headline);
        expect(row.source).toBe(row.locale === "en");
      }
    },
  );

  it.each(["de", "es", "fr"] as const)(
    "puts the %s page's own catalog right after the source, so a phone shows it",
    (locale) => {
      expect(ledgerRows(locale)[1]?.locale).toBe(locale);
    },
  );

  it("follows the source with German on the English page", () => {
    expect(ledgerRows("en")[1]?.locale).toBe("de");
  });
});

describe("HERO_HEADLINE_LOCK_HASH", () => {
  it("is the hash every target locale of the lock file holds for the headline", () => {
    for (const locale of ["de", "es", "fr"]) {
      expect(LOCK.locales[locale]?.[HERO_HEADLINE_KEY]).toBe(HERO_HEADLINE_LOCK_HASH);
    }
  });

  it("is the content hash of the current English headline, so the lock is not stale", () => {
    expect(
      contentHash({
        key: HERO_HEADLINE_KEY,
        namespace: "",
        value: en.landing.hero.headline,
        placeholders: [],
        isPlural: false,
      }),
    ).toBe(HERO_HEADLINE_LOCK_HASH);
  });

  it("is never typed into the source", () => {
    const source = readFileSync(new URL("./hero-ledger.ts", import.meta.url), "utf8");
    expect(source).not.toContain(HERO_HEADLINE_LOCK_HASH);
  });
});
