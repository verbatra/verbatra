import { describe, expect, it, vi } from "vitest";
import { LOCALES, type Locale, localePrefix } from "@/lib/locales";

interface FakePage {
  readonly slugs: readonly string[];
  readonly url: string;
}

const PAGES: Record<string, readonly FakePage[]> = {
  en: [
    { slugs: ["intro"], url: "/docs/intro" },
    { slugs: ["english-only"], url: "/docs/english-only" },
  ],
  de: [{ slugs: ["intro"], url: "/de/docs/intro" }],
  es: [{ slugs: ["intro"], url: "/es/docs/intro" }],
  fr: [{ slugs: ["intro"], url: "/fr/docs/intro" }],
  "zh-CN": [{ slugs: ["intro"], url: "/zh-CN/docs/intro" }],
  "pt-BR": [{ slugs: ["intro"], url: "/pt-BR/docs/intro" }],
};

vi.mock("@/lib/source", () => ({
  source: {
    getPages: (locale: string) => PAGES[locale] ?? [],
    getPage: (slugs: readonly string[], locale: string) =>
      (PAGES[locale] ?? []).find((page) => page.slugs.join("/") === slugs.join("/")),
  },
}));

const { default: sitemap } = await import("./sitemap");
const { LANDING_LAST_UPDATED, LEGAL_LAST_UPDATED } = await import("@/lib/site");
const { COMPARE_LAST_CHECKED } = await import("@/lib/landing-compare");

const ORIGIN = "https://verbatra.kreitz-webdev.de";

function urlOf(locale: Locale, path: string): string {
  return `${ORIGIN}${localePrefix(locale)}${path}`;
}

function languagesOf(path: string): Record<string, string> {
  return Object.fromEntries(LOCALES.map((locale) => [locale, urlOf(locale, path)]));
}

const HOME_LANGUAGES = Object.fromEntries(
  LOCALES.map((locale) => [locale, locale === "en" ? `${ORIGIN}/` : urlOf(locale, "")]),
);

const TRANSLATED_DOCS_URLS = LOCALES.slice(1).map((locale) => urlOf(locale, "/docs/intro"));

const COMPARE_URLS = LOCALES.map((locale) => urlOf(locale, "/compare"));

const LEGAL_URLS = LOCALES.flatMap((locale) =>
  (["/contact", "/imprint", "/licenses", "/privacy"] as const).map((path) => urlOf(locale, path)),
);
describe("sitemap", () => {
  it("emits the locale roots first, then the comparison, the docs pages and the legal pages", () => {
    expect(sitemap().map((entry) => entry.url)).toEqual([
      ...Object.values(HOME_LANGUAGES),
      ...COMPARE_URLS,
      `${ORIGIN}/docs/intro`,
      `${ORIGIN}/docs/english-only`,
      ...TRANSLATED_DOCS_URLS,
      ...LEGAL_URLS,
    ]);
  });

  it("spells the Simplified Chinese comparison entry and its alternates out literally", () => {
    const entry = sitemap().find(
      (candidate) => candidate.url === "https://verbatra.kreitz-webdev.de/zh-CN/compare",
    );
    expect(entry?.alternates).toEqual({
      languages: {
        en: "https://verbatra.kreitz-webdev.de/compare",
        de: "https://verbatra.kreitz-webdev.de/de/compare",
        es: "https://verbatra.kreitz-webdev.de/es/compare",
        fr: "https://verbatra.kreitz-webdev.de/fr/compare",
        "zh-CN": "https://verbatra.kreitz-webdev.de/zh-CN/compare",
        "pt-BR": "https://verbatra.kreitz-webdev.de/pt-BR/compare",
      },
    });
  });

  it("ranks the English root above the other roots, both above every docs page and the comparison, and the legal pages lowest", () => {
    expect(sitemap().map((entry) => entry.priority)).toEqual([
      1,
      ...LOCALES.slice(1).map(() => 0.9),
      ...COMPARE_URLS.map(() => 0.7),
      ...[...LOCALES, "english-only"].map(() => 0.8),
      ...LEGAL_URLS.map(() => 0.3),
    ]);
  });

  it("stamps the landing page in every locale with the date its copy last changed", () => {
    const home = sitemap().filter((entry) =>
      Object.values(HOME_LANGUAGES).includes(entry.url ?? ""),
    );
    expect(home).toHaveLength(LOCALES.length);
    for (const entry of home) expect(entry.lastModified).toBe(LANDING_LAST_UPDATED);
  });

  it("stamps the docs pages with one build-time lastModified value", () => {
    const entries = sitemap().filter((entry) => entry.url?.includes("/docs/"));
    const first = entries[0]?.lastModified;
    expect(first).toBeInstanceOf(Date);
    for (const entry of entries) {
      expect(entry.lastModified).toBe(first);
    }
  });

  it("stamps the legal pages with the date their text last changed", () => {
    const legal = sitemap().filter((entry) => LEGAL_URLS.includes(entry.url ?? ""));
    expect(legal).toHaveLength(LEGAL_URLS.length);
    for (const entry of legal) {
      expect(entry.lastModified).toBe(LEGAL_LAST_UPDATED);
    }
  });

  it("stamps the comparison in every locale with the day its sources were checked", () => {
    const compare = sitemap().filter((entry) => COMPARE_URLS.includes(entry.url ?? ""));
    expect(compare).toHaveLength(COMPARE_URLS.length);
    for (const entry of compare) {
      expect(entry.lastModified).toBe(COMPARE_LAST_CHECKED);
      expect(entry.alternates).toEqual({
        languages: languagesOf("/compare"),
      });
    }
  });

  it("marks the home and docs pages as changing weekly, and the comparison and legal pages monthly", () => {
    const entries = sitemap();
    const monthly = [...LEGAL_URLS, ...COMPARE_URLS];
    const legal = entries.filter((entry) => monthly.includes(entry.url ?? ""));
    const rest = entries.filter((entry) => !monthly.includes(entry.url ?? ""));
    expect(rest.every((entry) => entry.changeFrequency === "weekly")).toBe(true);
    expect(legal.every((entry) => entry.changeFrequency === "monthly")).toBe(true);
  });

  it("cross-links each legal page to its locale variants, with no x-default", () => {
    const contact = sitemap().find((entry) => entry.url === `${ORIGIN}/contact`);
    expect(contact?.alternates).toEqual({
      languages: languagesOf("/contact"),
    });
    expect(contact?.alternates?.languages).not.toHaveProperty("x-default");
  });

  it("gives every locale root the same hreflang set, with no x-default", () => {
    for (const entry of sitemap().slice(0, LOCALES.length)) {
      expect(entry.alternates).toEqual({ languages: HOME_LANGUAGES });
      expect(entry.alternates?.languages).not.toHaveProperty("x-default");
    }
  });

  it("cross-links a docs page to every locale it exists in", () => {
    const intro = sitemap().find((entry) => entry.url === `${ORIGIN}/docs/intro`);
    expect(intro?.alternates).toEqual({
      languages: languagesOf("/docs/intro"),
    });
  });

  it("omits the locales an untranslated docs page has no copy in", () => {
    const untranslated = sitemap().find((entry) => entry.url === `${ORIGIN}/docs/english-only`);
    expect(untranslated?.alternates).toEqual({
      languages: { en: `${ORIGIN}/docs/english-only` },
    });
  });
});
