import { describe, expect, it, vi } from "vitest";

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
};

vi.mock("@/lib/source", () => ({
  source: {
    getPages: (locale: string) => PAGES[locale] ?? [],
    getPage: (slugs: readonly string[], locale: string) =>
      (PAGES[locale] ?? []).find((page) => page.slugs.join("/") === slugs.join("/")),
  },
}));

const { default: sitemap } = await import("./sitemap");

const ORIGIN = "https://verbatra.kreitz-webdev.de";

const HOME_LANGUAGES = {
  en: `${ORIGIN}/`,
  de: `${ORIGIN}/de`,
  es: `${ORIGIN}/es`,
  fr: `${ORIGIN}/fr`,
};

const LEGAL_URLS = [
  `${ORIGIN}/contact`,
  `${ORIGIN}/imprint`,
  `${ORIGIN}/privacy`,
  `${ORIGIN}/de/contact`,
  `${ORIGIN}/de/imprint`,
  `${ORIGIN}/de/privacy`,
  `${ORIGIN}/es/contact`,
  `${ORIGIN}/es/imprint`,
  `${ORIGIN}/es/privacy`,
  `${ORIGIN}/fr/contact`,
  `${ORIGIN}/fr/imprint`,
  `${ORIGIN}/fr/privacy`,
];

describe("sitemap", () => {
  it("emits the locale roots first, then the docs pages, then the legal pages", () => {
    expect(sitemap().map((entry) => entry.url)).toEqual([
      `${ORIGIN}/`,
      `${ORIGIN}/de`,
      `${ORIGIN}/es`,
      `${ORIGIN}/fr`,
      `${ORIGIN}/docs/intro`,
      `${ORIGIN}/docs/english-only`,
      `${ORIGIN}/de/docs/intro`,
      `${ORIGIN}/es/docs/intro`,
      `${ORIGIN}/fr/docs/intro`,
      ...LEGAL_URLS,
    ]);
  });

  it("ranks the English root above the other roots, both above every docs page, and the legal pages lowest", () => {
    expect(sitemap().map((entry) => entry.priority)).toEqual([
      1,
      0.9,
      0.9,
      0.9,
      0.8,
      0.8,
      0.8,
      0.8,
      0.8,
      ...LEGAL_URLS.map(() => 0.3),
    ]);
  });

  it("marks the home and docs pages as changing weekly, and the legal pages monthly", () => {
    const entries = sitemap();
    const legal = entries.filter((entry) => LEGAL_URLS.includes(entry.url ?? ""));
    const rest = entries.filter((entry) => !LEGAL_URLS.includes(entry.url ?? ""));
    expect(rest.every((entry) => entry.changeFrequency === "weekly")).toBe(true);
    expect(legal.every((entry) => entry.changeFrequency === "monthly")).toBe(true);
  });

  it("cross-links each legal page to its locale variants, with no x-default", () => {
    const contact = sitemap().find((entry) => entry.url === `${ORIGIN}/contact`);
    expect(contact?.alternates).toEqual({
      languages: {
        en: `${ORIGIN}/contact`,
        de: `${ORIGIN}/de/contact`,
        es: `${ORIGIN}/es/contact`,
        fr: `${ORIGIN}/fr/contact`,
      },
    });
    expect(contact?.alternates?.languages).not.toHaveProperty("x-default");
  });

  it("gives every locale root the same hreflang set, with no x-default", () => {
    for (const entry of sitemap().slice(0, 4)) {
      expect(entry.alternates).toEqual({ languages: HOME_LANGUAGES });
      expect(entry.alternates?.languages).not.toHaveProperty("x-default");
    }
  });

  it("cross-links a docs page to every locale it exists in", () => {
    const intro = sitemap().find((entry) => entry.url === `${ORIGIN}/docs/intro`);
    expect(intro?.alternates).toEqual({
      languages: {
        en: `${ORIGIN}/docs/intro`,
        de: `${ORIGIN}/de/docs/intro`,
        es: `${ORIGIN}/es/docs/intro`,
        fr: `${ORIGIN}/fr/docs/intro`,
      },
    });
  });

  it("omits the locales an untranslated docs page has no copy in", () => {
    const untranslated = sitemap().find((entry) => entry.url === `${ORIGIN}/docs/english-only`);
    expect(untranslated?.alternates).toEqual({
      languages: { en: `${ORIGIN}/docs/english-only` },
    });
  });
});
