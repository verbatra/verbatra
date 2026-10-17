import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { normalizeText, stableStringHash } from "@verbatra/core";
import { createDefaultRegistry } from "@verbatra/sdk";
import { describe, expect, it } from "vitest";
import { i18n } from "./i18n";

type HashTable = Readonly<Record<string, Readonly<Record<string, string>>>>;
type ProvenanceTable = Readonly<
  Record<string, Readonly<Record<string, { readonly valueHash: string }>>>
>;

const TARGET_LOCALES: readonly string[] = i18n.languages.filter(
  (locale) => locale !== i18n.defaultLanguage,
);

const AWAITING_RETRANSLATION: ReadonlySet<string> = new Set([
  "landing.faq.items.cost.answer",
  "landing.faq.items.cost.question",
  "landing.faq.items.formats.answer",
  "landing.faq.items.formats.question",
  "landing.faq.items.incremental.question",
  "landing.faq.items.privacy.answer",
  "landing.faq.items.privacy.question",
  "landing.faq.items.providers.answer",
]);

function appPath(relative: string): string {
  return fileURLToPath(new URL(`../${relative}`, import.meta.url));
}

function readLocales<T>(file: string): T {
  return (JSON.parse(readFileSync(appPath(file), "utf8")) as { locales: T }).locales;
}

function valueHash(value: string): string {
  return stableStringHash(normalizeText(value));
}

async function readCatalog(locale: string) {
  const file = appPath(`messages/${locale}.json`);
  const resolution = createDefaultRegistry().resolve(file, { format: "next-intl-json" });
  if (resolution.status !== "resolved") throw new Error(`no adapter for ${file}`);
  const { resource } = await resolution.adapter.read(file, locale);
  return resource.entries;
}

const provenance = readLocales<ProvenanceTable>("verbatra.provenance.json");
const lock = readLocales<HashTable>("verbatra.lock.json");
const catalogs = new Map(
  await Promise.all(
    TARGET_LOCALES.map(async (locale) => [locale, await readCatalog(locale)] as const),
  ),
);

function catalogValue(locale: string, key: string): string | undefined {
  return catalogs.get(locale)?.get(key)?.value;
}

const records = TARGET_LOCALES.flatMap((locale) =>
  Object.entries(provenance[locale] ?? {}).map(([key, record]) => ({ locale, key, record })),
);

describe("translation provenance", () => {
  it("pairs every provenance record with a lock entry and a catalog value", () => {
    for (const { locale, key } of records) {
      expect(lock[locale]?.[key], `${locale} ${key} lock`).toBeDefined();
      expect(catalogValue(locale, key), `${locale} ${key} value`).toBeDefined();
    }
  });

  it("hashes the current catalog value of every key not awaiting retranslation", () => {
    const current = records.filter(({ key }) => !AWAITING_RETRANSLATION.has(key));
    expect(current.length).toBeGreaterThan(0);
    for (const { locale, key, record } of current) {
      expect(record.valueHash, `${locale} ${key}`).toBe(valueHash(catalogValue(locale, key) ?? ""));
    }
  });

  it("exempts only keys whose recorded hash still differs from the catalog in some locale", () => {
    const stale = new Set(
      records
        .filter(({ locale, key, record }) => {
          const value = catalogValue(locale, key);
          return value !== undefined && record.valueHash !== valueHash(value);
        })
        .map(({ key }) => key),
    );
    expect([...AWAITING_RETRANSLATION].filter((key) => !stale.has(key))).toEqual([]);
  });

  it("never holds the hash of another locale's value", () => {
    for (const { locale, key, record } of records) {
      for (const other of TARGET_LOCALES.filter((candidate) => candidate !== locale)) {
        const value = catalogValue(other, key);
        if (value === undefined || value === catalogValue(locale, key)) continue;
        expect(record.valueHash, `${locale} ${key} holds the ${other} hash`).not.toBe(
          valueHash(value),
        );
      }
    }
  });
});
