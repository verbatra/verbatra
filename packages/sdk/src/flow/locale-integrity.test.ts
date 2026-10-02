import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { VerbatraConfig } from "../config/schema.js";
import { baseConfig, makeTempDir, writeJsonFile } from "../test-support.js";
import { localeIntegrity } from "./locale-integrity.js";

const cfg = (overrides: Partial<VerbatraConfig> = {}): VerbatraConfig =>
  baseConfig({ targetLocales: ["de", "ar"], format: "next-intl-json", ...overrides });

async function project(
  source: Record<string, unknown>,
  targets: Record<string, Record<string, unknown>>,
): Promise<string> {
  const dir = await makeTempDir();
  await mkdir(join(dir, "locales"));
  await writeJsonFile(join(dir, "locales", "en.json"), source);
  for (const [locale, obj] of Object.entries(targets)) {
    await writeJsonFile(join(dir, "locales", `${locale}.json`), obj);
  }
  return dir;
}

const SOURCE = {
  total: "Total: {amount}",
  price: "Price: {amount}",
  items: "{count, plural, one {# item} other {# items}}",
  files: "{count, plural, one {# file} other {# files}}",
  title: "Checkout",
};

describe("localeIntegrity", () => {
  it("finds defects in keys that are in sync, which keyIntegrity never judges", async () => {
    const dir = await project(SOURCE, {
      de: {
        total: "Summe: {betrag}",
        price: "Preis: {amount} {currency}",
        items: "{count, plural, other {# Artikel}}",
        files: "{count, plural, one {# Datei} other {# Dateien}}",
        title: "Kasse",
      },
      ar: {
        total: "المجموع: {amount}",
        price: "السعر: {amount}",
        items: "{count, plural, other {# عناصر}}",
        title: "الدفع",
      },
    });

    const [de, ar] = await localeIntegrity({ config: cfg(), cwd: dir });

    expect(de?.locale).toBe("de");
    expect(de?.entries.map((entry) => entry.key).sort()).toEqual(["items", "price", "total"]);
    expect(de?.entries.find((entry) => entry.key === "total")).toMatchObject({
      matches: false,
      missing: ["{amount}"],
      extra: ["{betrag}"],
    });
    expect(de?.entries.find((entry) => entry.key === "price")).toMatchObject({
      matches: false,
      missing: [],
      extra: ["{currency}"],
    });
    expect(de?.entries.find((entry) => entry.key === "items")).toMatchObject({
      icuArmsMatch: false,
    });
    expect(de?.entries.find((entry) => entry.key === "items")?.icuArmDetails.join(" ")).toContain(
      '"one"',
    );

    expect(ar?.entries.map((entry) => entry.key)).toEqual(["items"]);
    expect(ar?.entries[0]?.icuArmDetails.length).toBeGreaterThan(0);
  });

  it("returns an empty list for a locale whose every translation passes", async () => {
    const dir = await project(SOURCE, {
      de: { total: "Summe: {amount}", title: "Kasse" },
    });

    const results = await localeIntegrity({ config: cfg(), cwd: dir, locales: ["de"] });

    expect(results).toEqual([{ locale: "de", entries: [] }]);
  });

  it("ignores orphaned keys the source no longer has", async () => {
    const dir = await project(SOURCE, { de: { removed: "{kaputt" } });

    const results = await localeIntegrity({ config: cfg(), cwd: dir, locales: ["de"] });

    expect(results).toEqual([{ locale: "de", entries: [] }]);
  });

  it("flags lost rich-text tags and invalid ICU the same way the write gate does", async () => {
    const dir = await project(
      { link: "Read <b>this</b>", broken: "Hello {name}" },
      { de: { link: "Lies das", broken: "Hallo {name" } },
    );

    const [de] = await localeIntegrity({
      config: cfg({ targetLocales: ["de"] }),
      cwd: dir,
    });

    expect(de?.entries.find((entry) => entry.key === "link")).toMatchObject({ matches: false });
    expect(de?.entries.find((entry) => entry.key === "broken")).toMatchObject({
      icuValid: false,
    });
  });

  it("flags a translation that dropped the source's inline HTML", async () => {
    const dir = await project({ link: "Read <b>this</b> now" }, { de: { link: "Lies das jetzt" } });

    const [de] = await localeIntegrity({
      config: cfg({ targetLocales: ["de"], format: "i18next-json" }),
      cwd: dir,
    });

    expect(de?.entries).toEqual([expect.objectContaining({ key: "link", markupMatches: false })]);
  });

  it("rejects a locale that is not a configured target", async () => {
    const dir = await project(SOURCE, { de: {} });

    await expect(
      localeIntegrity({ config: cfg(), cwd: dir, locales: ["fr"] }),
    ).rejects.toMatchObject({ code: "UNKNOWN_LOCALE" });
  });
});
