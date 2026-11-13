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
  COMPARE_PUBLISHED,
  COMPARE_ROWS,
  COMPARE_TOOL_NAMES,
  COMPARE_TOOLS,
  type CompareRowId,
  type CompareTool,
  compareCell,
  compareSourceHref,
  verdictMark,
} from "@/lib/landing-compare";
import { MACHINE_PROVIDER_IDS, SUPPORTED_FORMAT_IDS } from "@/lib/landing-facts";
import { preloadRegisteredIslands } from "@/test-support/islands";
import { resolveServer } from "@/test-support/resolve-server";

const MESSAGES_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../../../messages");

type Catalog = {
  compare: Record<string, unknown> & {
    meta: { title: string; description: string; ogImageAlt: string };
    heading: string;
  };
  landing: {
    compare: {
      verdicts: Record<string, string>;
      columns: { manual: string; lingoDetail: string; manualDetail: string };
      rows: Record<
        string,
        Record<string, { label?: string; detail?: string; value?: string; note?: string }>
      >;
      sourceLink: string;
      sourceLinkNth: string;
    };
  };
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
  getTranslations: async ({
    locale,
    namespace,
  }: {
    locale: string;
    namespace: "landing.compare" | "compare";
  }) =>
    createTranslator({
      locale,
      messages: JSON.parse(readFileSync(join(MESSAGES_DIR, `${locale}.json`), "utf8")),
      namespace,
    }),
}));

const { default: CompareRoute, generateMetadata } = await import("./page");

await preloadRegisteredIslands();

const ORIGIN = "https://verbatra.kreitz-webdev.de";

const PREFIX: Readonly<Record<Locale, string>> = { en: "", de: "/de", es: "/es", fr: "/fr" };

async function render(locale: Locale): Promise<Document> {
  const page = await resolveServer(
    await CompareRoute({ params: Promise.resolve({ lang: locale }) }),
  );
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

function expectCellBody(
  cell: Element | undefined,
  row: CompareRowId,
  tool: CompareTool,
  verdicts: Record<string, string>,
): void {
  const model = compareCell(row, tool);
  const body = cell?.querySelector("[data-cell]");
  expect(body?.getAttribute("data-cell"), `${row}.${tool}`).toBe(model.kind);
  const word = body?.querySelector("[data-word]")?.textContent ?? "";
  expect(word, `${row}.${tool}`).not.toBe("");
  const marks = Array.from(body?.querySelectorAll(".vk-compare-mark") ?? []);
  if (model.kind !== "verdict") {
    expect(marks.length, `${row}.${tool}`).toBe(0);
    return;
  }
  expect(marks.map((mark) => mark.getAttribute("data-mark"))).toEqual([verdictMark(model.verdict)]);
  expect(word).toBe(verdicts[model.verdict]);
}

function expectSourceLinks(
  doc: Document,
  row: CompareRowId,
  tool: CompareTool,
  locale: Locale,
  compare: Catalog["landing"]["compare"],
): void {
  const links = Array.from(
    doc.querySelectorAll<HTMLAnchorElement>(
      `tr[data-row="${row}"] td[data-column="${tool}"] a[data-source]`,
    ),
  );
  expect(
    links.map((link) => link.getAttribute("href")),
    `${row}.${tool}`,
  ).toEqual(compareCell(row, tool).urls.map((link) => compareSourceHref(link, locale)));
  const toolLabel = tool === "manual" ? compare.columns.manual : COMPARE_TOOL_NAMES[tool];
  for (const link of links) {
    expect(link.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    expect(link.textContent).toContain(compare.rows[row]?.label ?? "");
    expect(link.textContent).toContain(toolLabel);
  }
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
      datePublished: COMPARE_PUBLISHED,
      dateModified: COMPARE_LAST_CHECKED,
    });
  });

  it("has exactly one h1, the page heading", async () => {
    const doc = await render(locale);
    expect(Array.from(doc.querySelectorAll("h1"), (h1) => h1.textContent)).toEqual([
      copy.compare.heading,
    ]);
  });

  it("opens with the heading, one takeaway, one scope sentence, the stronger line and the date, before the comparison", async () => {
    const doc = await render(locale);
    const header = doc.querySelector("article > header");
    expect(
      Array.from(
        header?.querySelectorAll("p") ?? [],
        (p) =>
          p.getAttribute("data-takeaway") ??
          p.getAttribute("data-scope") ??
          p.getAttribute("data-stronger") ??
          p.getAttribute("data-last-checked") !== null,
      ),
    ).toHaveLength(4);
    expect(header?.querySelector("[data-takeaway]")?.textContent).toBe(copy.compare.takeaway);
    expect(header?.querySelector("[data-scope]")?.textContent).toBe(copy.compare.scope);
    expect(header?.querySelector("[data-stronger]")?.textContent).toBe(copy.compare.stronger);
    expect(header?.querySelector("[data-last-checked] time")?.getAttribute("datetime")).toBe(
      COMPARE_LAST_CHECKED,
    );
    const comparison = doc.querySelector(".vk-compare");
    expect(header?.compareDocumentPosition(comparison as Node) ?? 0).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it("fills every cell of the full table with its verdict mark and word, or its value", async () => {
    const doc = await render(locale);
    const rows = Array.from(doc.querySelectorAll("tbody tr"));
    expect(rows.map((row) => row.getAttribute("data-row"))).toEqual([...COMPARE_ROWS]);
    for (const row of COMPARE_ROWS) {
      const cells = Array.from(doc.querySelectorAll(`tr[data-row="${row}"] td`));
      expect(cells.map((cell) => cell.getAttribute("data-column"))).toEqual([...COMPARE_TOOLS]);
      COMPARE_TOOLS.forEach((tool, index) => {
        expectCellBody(cells[index], row, tool, copy.landing.compare.verdicts);
      });
    }
  });

  it("links every cell straight to its sources with arrow-only links that name tool, criterion and source", async () => {
    const doc = await render(locale);
    for (const row of COMPARE_ROWS)
      for (const tool of COMPARE_TOOLS)
        expectSourceLinks(doc, row, tool, locale, copy.landing.compare);
  });

  it("has no footnote numbers, no source list and no source anchors", async () => {
    const doc = await render(locale);
    expect(doc.querySelector("[data-footnotes]")).toBeNull();
    expect(doc.querySelector("ol")).toBeNull();
    expect(doc.querySelector("[id^='source-']")).toBeNull();
    expect(doc.querySelector("a[href^='#source-']")).toBeNull();
    expect(Array.from(doc.querySelectorAll("h2"), (h2) => h2.textContent)).toEqual([
      copy.compare.nextHeading,
    ]);
  });

  it("renders all seven pairs as collapsed-by-default sections for a visitor without JavaScript", async () => {
    const doc = await render(locale);
    const pairs = Array.from(doc.querySelectorAll<HTMLDetailsElement>("details[data-pair]"));
    expect(pairs.map((pair) => pair.getAttribute("data-pair"))).toEqual(
      COMPARE_TOOLS.filter((tool) => tool !== "verbatra"),
    );
    expect(pairs.map((pair) => pair.hasAttribute("open"))).toEqual([
      true,
      false,
      false,
      false,
      false,
      false,
      false,
    ]);
    for (const pair of pairs) {
      expect(pair.querySelector("summary")?.textContent).toContain(
        COMPARE_TOOL_NAMES[pair.getAttribute("data-pair") as "lingo"] ??
          copy.landing.compare.columns.manual,
      );
      const rows = Array.from(pair.querySelectorAll("[data-row]"));
      expect(rows.map((row) => row.getAttribute("data-row"))).toEqual([...COMPARE_ROWS]);
      for (const row of rows)
        expect(
          Array.from(row.querySelectorAll("dd"), (dd) => dd.getAttribute("data-column")),
        ).toEqual(["verbatra", pair.getAttribute("data-pair")]);
    }
  });

  it("offers a native select of the seven tools that starts on Lingo.dev, and one skip link past the comparison", async () => {
    const doc = await render(locale);
    const select = doc.querySelector("select");
    expect(
      Array.from(select?.querySelectorAll("option") ?? [], (o) => o.getAttribute("value")),
    ).toEqual(COMPARE_TOOLS.filter((tool) => tool !== "verbatra"));
    expect(select?.querySelector("option[selected]")?.getAttribute("value") ?? "lingo").toBe(
      "lingo",
    );
    expect(doc.querySelector("label")?.textContent).toBe(copy.compare.pickerLabel);
    const skip = doc.querySelector<HTMLAnchorElement>("a[data-skip]");
    expect(skip?.textContent).toBe(copy.compare.skip);
    expect(doc.querySelector(skip?.getAttribute("href") ?? "#none")?.tagName).toBe("NAV");
  });

  it("counts the providers and formats from the registries and names no provider", async () => {
    const doc = await render(locale);
    const providers = doc.querySelector('tr[data-row="providers"] td[data-column="verbatra"]');
    expect(providers?.querySelector("[data-word]")?.textContent).toContain(
      String(MACHINE_PROVIDER_IDS.length),
    );
    expect(providers?.querySelector("[data-note]")).toBeNull();
    const formats = doc.querySelector('tr[data-row="formats"] td[data-column="verbatra"]');
    expect(formats?.textContent).toContain(String(SUPPORTED_FORMAT_IDS.length));
  });

  it("links the quickstart and the home page in the reader's locale", async () => {
    const doc = await render(locale);
    const hrefs = Array.from(doc.querySelectorAll("nav a"), (a) => a.getAttribute("href"));
    expect(hrefs).toEqual([`${PREFIX[locale]}/docs/quickstart`, PREFIX[locale] || "/"]);
  });

  it("keeps what the old notes said as small labels on the Lingo.dev and manual columns and the formats row", async () => {
    const doc = await render(locale);
    const { columns, rows } = copy.landing.compare;
    expect(doc.querySelector("thead th[data-column='lingo'] small")?.textContent).toBe(
      columns.lingoDetail,
    );
    expect(doc.querySelector("thead th[data-column='manual'] small")?.textContent).toBe(
      columns.manualDetail,
    );
    expect(doc.querySelector("tbody tr[data-row='formats'] th small")?.textContent).toBe(
      rows.formats?.detail,
    );
    expect(doc.querySelectorAll("thead th small")).toHaveLength(2);
    expect(doc.querySelectorAll("tbody th small")).toHaveLength(1);
  });

  it("names the table by its caption", async () => {
    const doc = await render(locale);
    expect(doc.querySelector("caption")?.textContent).toBe(copy.compare.caption);
  });
});

describe("the comparison cells", () => {
  const NO: Readonly<Record<Locale, RegExp>> = {
    en: /^No$/,
    de: /^Nein$/,
    es: /^No\b/,
    fr: /^Non$/,
  };

  const UNKNOWN: Readonly<Record<Locale, RegExp>> = {
    en: /^Unknown$/,
    de: /^Unbekannt$/,
    es: /^Desconocido$/,
    fr: /^Inconnu$/,
  };

  for (const locale of i18n.languages) {
    const { verdicts } = catalog(locale).landing.compare;

    it(`never claims in-context editing for Verbatra in ${locale}`, () => {
      expect(compareCell("inContext", "verbatra")).toMatchObject({ verdict: "no" });
      expect(verdicts.no).toMatch(NO[locale]);
    });

    it(`marks what no source settles with the unknown word in ${locale}`, () => {
      expect(verdicts.unknown).toMatch(UNKNOWN[locale]);
    });
  }

  it("writes an absence as nothing found, never as a missing feature", () => {
    const en = catalog("en").landing.compare.rows;
    for (const [row, cells] of Object.entries(en))
      for (const [tool, cell] of Object.entries(cells))
        expect(cell.note ?? "", `${row}.${tool}`).not.toMatch(/does not support|doesn't support/i);
  });
});
