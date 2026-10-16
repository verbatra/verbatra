// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createTranslator } from "next-intl";
import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { i18n, type Locale } from "@/lib/i18n";
import {
  COMPARE_LAST_CHECKED,
  COMPARE_ROWS,
  COMPARE_SOURCE_COUNT,
  COMPARE_TOOL_NAMES,
  COMPARE_TOOLS,
  cellFootnote,
  compareSource,
  FULL_CONCESSION_FOOTNOTES,
} from "@/lib/landing-compare";
import { MACHINE_PROVIDER_IDS, SUPPORTED_FORMAT_IDS } from "@/lib/landing-facts";
import { providerShortLabel } from "@/lib/landing-providers";
import { RELEASE_BADGE } from "@/lib/release-badge";

const MESSAGES_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../../../messages");

type Catalog = {
  compare: Record<string, unknown> & {
    meta: { title: string; description: string; ogImageAlt: string };
    heading: string;
  };
  landing: { compare: { rows: Record<string, Record<string, string>> } };
};

function catalog(locale: string): Catalog {
  return JSON.parse(readFileSync(join(MESSAGES_DIR, `${locale}.json`), "utf8")) as Catalog;
}

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    prefetch: _prefetch,
    ...rest
  }: ComponentProps<"a"> & { href: string; prefetch?: unknown }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("next-intl/server", () => ({
  setRequestLocale: () => undefined,
  getTranslations: async ({ locale, namespace }: { locale: string; namespace: string }) =>
    createTranslator({
      locale,
      messages: JSON.parse(readFileSync(join(MESSAGES_DIR, `${locale}.json`), "utf8")),
      namespace: namespace as never,
    }),
}));

const { default: CompareRoute, generateMetadata } = await import("./page");

const ORIGIN = "https://verbatra.kreitz-webdev.de";

const PREFIX: Readonly<Record<Locale, string>> = { en: "", de: "/de", es: "/es", fr: "/fr" };

async function render(locale: Locale): Promise<Document> {
  const page = await CompareRoute({ params: Promise.resolve({ lang: locale }) });
  return new DOMParser().parseFromString(renderToStaticMarkup(page), "text/html");
}

async function metadata(locale: Locale) {
  return generateMetadata({ params: Promise.resolve({ lang: locale }) });
}

function jsonLd(doc: Document): ReadonlyArray<Record<string, unknown>> {
  return Array.from(doc.querySelectorAll('script[type="application/ld+json"]'), (node) =>
    JSON.parse(node.textContent ?? "{}"),
  );
}

describe.each(i18n.languages)("the %s comparison page", (locale) => {
  const copy = catalog(locale);
  const path = `${PREFIX[locale]}/compare`;

  it("has its own title and description of a search-result length", async () => {
    const meta = await metadata(locale);
    expect(meta.title).toEqual({ absolute: copy.compare.meta.title });
    expect(meta.description).toBe(copy.compare.meta.description);
    expect(copy.compare.meta.title).toMatch(/Verbatra/);
    expect(copy.compare.meta.title.length).toBeGreaterThanOrEqual(50);
    expect(copy.compare.meta.title.length).toBeLessThanOrEqual(60);
    expect(copy.compare.meta.description.length).toBeGreaterThanOrEqual(150);
    expect(copy.compare.meta.description.length).toBeLessThanOrEqual(160);
  });

  it("points its canonical at itself, lists every locale plus x-default and its markdown", async () => {
    const meta = await metadata(locale);
    expect(meta.alternates).toEqual({
      canonical: path,
      languages: {
        en: "/compare",
        de: "/de/compare",
        es: "/es/compare",
        fr: "/fr/compare",
        "x-default": "/compare",
      },
      types: { "text/markdown": `${path}.md` },
    });
  });

  it("shares its own social image and title", async () => {
    const meta = await metadata(locale);
    expect(meta.openGraph).toMatchObject({
      url: `${ORIGIN}${path}`,
      title: copy.compare.meta.title,
      type: "article",
      images: [{ url: `${PREFIX[locale]}/compare-og`, alt: copy.compare.meta.ogImageAlt }],
    });
  });

  it("describes itself as a dated article under a Home > Compare breadcrumb", async () => {
    const [breadcrumb, article] = jsonLd(await render(locale));
    expect(breadcrumb).toMatchObject({
      "@type": "BreadcrumbList",
      itemListElement: [
        { position: 1, item: `${ORIGIN}${PREFIX[locale] || "/"}` },
        { position: 2, name: copy.compare.breadcrumbCompare, item: `${ORIGIN}${path}` },
      ],
    });
    expect(article).toMatchObject({
      "@type": "TechArticle",
      headline: copy.compare.heading,
      description: copy.compare.meta.description,
      url: `${ORIGIN}${path}`,
      inLanguage: locale,
      dateModified: COMPARE_LAST_CHECKED,
    });
  });

  it("has exactly one h1, the page heading", async () => {
    const doc = await render(locale);
    expect(Array.from(doc.querySelectorAll("h1"), (h1) => h1.textContent)).toEqual([
      copy.compare.heading,
    ]);
  });

  it("fills every cell of the full table with text and its own footnote", async () => {
    const doc = await render(locale);
    const rows = Array.from(doc.querySelectorAll("tbody tr"));
    expect(rows.map((row) => row.getAttribute("data-row"))).toEqual([...COMPARE_ROWS]);
    for (const row of COMPARE_ROWS) {
      const cells = Array.from(doc.querySelectorAll(`tr[data-row="${row}"] td`));
      expect(cells.map((cell) => cell.getAttribute("data-column"))).toEqual([...COMPARE_TOOLS]);
      COMPARE_TOOLS.forEach((tool, index) => {
        const cell = cells[index];
        const text = cell?.querySelector("[data-cell-text]")?.textContent?.trim() ?? "";
        expect(text, `${row}.${tool}`).not.toBe("");
        const refs = Array.from(cell?.querySelectorAll("[data-footnotes] a") ?? []);
        expect(refs.map((ref) => ref.textContent)).toEqual([String(cellFootnote(row, tool))]);
      });
    }
  });

  it("resolves every footnote link to a listed source or the manual note", async () => {
    const doc = await render(locale);
    const refs = Array.from(doc.querySelectorAll<HTMLAnchorElement>("[data-footnotes] a"));
    expect(refs.length).toBe(
      COMPARE_ROWS.length * COMPARE_TOOLS.length + FULL_CONCESSION_FOOTNOTES.length,
    );
    for (const ref of refs) {
      const target = doc.querySelector(ref.getAttribute("href") ?? "#none");
      expect(target, ref.getAttribute("href") ?? "").not.toBeNull();
      if (ref.textContent !== "M") expect(target?.getAttribute("value")).toBe(ref.textContent);
    }
    const items = Array.from(doc.querySelectorAll("li[id^='compare-source-']"));
    expect(items.map((item) => Number(item.getAttribute("value")))).toEqual(
      Array.from({ length: COMPARE_SOURCE_COUNT }, (_, index) => index + 1),
    );
    for (const item of items) {
      const source = compareSource(Number(item.getAttribute("value")));
      expect(item.textContent).toContain(COMPARE_TOOL_NAMES[source.tool]);
      expect(item.querySelectorAll("a").length).toBe(source.urls.length);
    }
  });

  it("lists the providers from the provider table and dates the ones a release adds", async () => {
    const doc = await render(locale);
    const cell = doc.querySelector('tr[data-row="providers"] td[data-column="verbatra"]');
    expect(
      Array.from(cell?.querySelectorAll("[data-provider]") ?? [], (node) => node.textContent),
    ).toEqual(MACHINE_PROVIDER_IDS.map(providerShortLabel));
    expect(cell?.querySelectorAll(".vk-available-from").length).toBe(
      RELEASE_BADGE.providers.length,
    );
    expect(cell?.textContent).not.toContain("");
  });

  it("counts the formats from the format table", async () => {
    const doc = await render(locale);
    const cell = doc.querySelector('tr[data-row="formats"] td[data-column="verbatra"]');
    expect(cell?.textContent).toContain(String(SUPPORTED_FORMAT_IDS.length));
  });

  it("links the quickstart and the home page in the reader's locale", async () => {
    const doc = await render(locale);
    const hrefs = Array.from(doc.querySelectorAll("nav a"), (a) => a.getAttribute("href"));
    expect(hrefs).toEqual([`${PREFIX[locale]}/docs/quickstart`, PREFIX[locale] || "/"]);
  });

  it("dates the check and frames the comparison as ways to keep locale files translated", async () => {
    const doc = await render(locale);
    expect(doc.querySelector("[data-last-checked] time")?.getAttribute("datetime")).toBe(
      COMPARE_LAST_CHECKED,
    );
    expect(doc.querySelector("[data-fairness]")?.textContent).not.toBe("");
    expect(doc.querySelector("caption")?.textContent).toBe(copy.compare.caption);
    expect(Array.from(doc.querySelectorAll("[data-concession] a"), (a) => a.textContent)).toEqual(
      FULL_CONCESSION_FOOTNOTES.map(String),
    );
  });
});

describe("the comparison cells", () => {
  const en = catalog("en").landing.compare.rows;

  it("never claims in-context editing for Verbatra", () => {
    expect(en.inContext?.verbatra).toBe("No");
  });

  it("marks what no source settles as unknown rather than guessing", () => {
    for (const [row, tool] of [
      ["selfHosting", "crowdin"],
      ["selfHosting", "phrase"],
      ["inContext", "lingo"],
      ["ownKeys", "lokalise"],
    ] as const) {
      expect(en[row]?.[tool], `${row}.${tool}`).toMatch(/^Unknown\b/);
    }
  });

  it("writes an absence as nothing found, never as a missing feature", () => {
    for (const [row, cells] of Object.entries(en))
      for (const [tool, text] of Object.entries(cells))
        expect(text, `${row}.${tool}`).not.toMatch(/does not support|doesn't support/i);
  });
});
