import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { i18n, type Locale } from "@/lib/i18n";
import {
  COMPARE_ROWS,
  COMPARE_SOURCE_COUNT,
  COMPARE_TOOLS,
  cellFootnote,
  compareSource,
  compareSourceHref,
} from "@/lib/landing-compare";
import { MACHINE_PROVIDER_IDS } from "@/lib/landing-facts";
import { providerShortLabel } from "@/lib/landing-providers";
import { absoluteMarkdownHref } from "@/lib/markdown-links";
import { SITE_MARKDOWN_PAGES, siteMarkdownSlug } from "@/lib/markdown-route";

const MESSAGES_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../../../messages");

vi.mock(
  "next-intl/server",
  async () => (await import("@/test-support/catalog-intl")).catalogIntlServer,
);

const { GET, generateStaticParams } = await import("./route");

async function markdown(lang: string, page = "compare"): Promise<Response> {
  return GET(new Request(`http://localhost/${lang}/site.mdx/${page}`), {
    params: Promise.resolve({ lang, page }),
  });
}

function messagesOf(lang: string) {
  return JSON.parse(readFileSync(join(MESSAGES_DIR, `${lang}.json`), "utf8"));
}

function markdownCell(rows: ReadonlyArray<string>, row: string, tool: string): string {
  const line = rows[COMPARE_ROWS.indexOf(row as never) + 2] ?? "";
  const cells = line.split(/(?<!\\)\|/).slice(1, -1);
  return cells[COMPARE_TOOLS.indexOf(tool as never) + 1]?.trim() ?? "";
}

function expectEveryCellFootnoted(rows: ReadonlyArray<string>): void {
  for (const row of COMPARE_ROWS)
    for (const tool of COMPARE_TOOLS) {
      const cell = markdownCell(rows, row, tool);
      const note = `[${cellFootnote(row, tool)}]`;
      expect(cell.endsWith(note), `${row}.${tool}`).toBe(true);
      expect(cell.length, `${row}.${tool}`).toBeGreaterThan(note.length);
    }
}

function expectVerdictWords(rows: ReadonlyArray<string>, verdicts: Record<string, string>): void {
  expect(markdownCell(rows, "ownKeys", "verbatra").startsWith(`${verdicts.yes}`)).toBe(true);
  expect(markdownCell(rows, "ci", "tolgee").startsWith(`${verdicts.noneFound}`)).toBe(true);
  expect(markdownCell(rows, "inContext", "verbatra").startsWith(`${verdicts.no}`)).toBe(true);
  expect(markdownCell(rows, "cli", "manual").startsWith(`${verdicts.notApplicable}`)).toBe(true);
  expect(markdownCell(rows, "providers", "verbatra")).toContain(`${MACHINE_PROVIDER_IDS.length}`);
}

function expectNumberedSources(body: string, lang: Locale): void {
  for (let footnote = 1; footnote <= COMPARE_SOURCE_COUNT; footnote += 1) {
    const line = body.split("\n").find((entry) => entry.startsWith(`${footnote}. `));
    expect(line, `${footnote}`).toBeDefined();
    for (const link of compareSource(footnote).urls) {
      const href = compareSourceHref(link, lang);
      expect(line).toContain(href.startsWith("/") ? absoluteMarkdownHref(href) : href);
    }
  }
}

describe("GET /[lang]/site.mdx/[page]", () => {
  it("is generated for every page in every locale", () => {
    expect(generateStaticParams()).toEqual(
      i18n.languages.flatMap((lang) =>
        SITE_MARKDOWN_PAGES.map((page) => ({ lang, page: siteMarkdownSlug(page) })),
      ),
    );
  });

  it("answers an unknown locale or page with 404", async () => {
    expect((await markdown("xx")).status).toBe(404);
    expect((await markdown("en", "terms")).status).toBe(404);
  });

  it.each(
    i18n.languages.flatMap((lang) => SITE_MARKDOWN_PAGES.map((page) => [lang, page] as const)),
  )(
    "serves the %s page %s as markdown with its canonical page and frontmatter",
    async (lang, page) => {
      const response = await markdown(lang, siteMarkdownSlug(page));
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
      const path =
        page === "/"
          ? lang === "en"
            ? "/"
            : `/${lang}`
          : lang === "en"
            ? page
            : `/${lang}${page}`;
      expect(response.headers.get("link")).toBe(
        `<https://verbatra.kreitz-webdev.de${path}>; rel="canonical"`,
      );
      const body = await response.text();
      expect(body).toMatch(/^---\ntitle: ".+"\n(description: ".+"\n)?---\n\n# .+\n/);
      expect(body).not.toMatch(/\]\(\//);
      expect(body).not.toContain("\u2014");
      expect(body.endsWith("\n")).toBe(true);
    },
  );

  it.each(i18n.languages)(
    "serves the %s comparison as markdown with its canonical page",
    async (lang) => {
      const response = await markdown(lang);
      expect(response.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
      const path = lang === "en" ? "/compare" : `/${lang}/compare`;
      expect(response.headers.get("link")).toBe(
        `<https://verbatra.kreitz-webdev.de${path}>; rel="canonical"`,
      );
      const messages = messagesOf(lang);
      const body = await response.text();
      expect(body.startsWith(`---\ntitle: ${JSON.stringify(messages.compare.meta.title)}`)).toBe(
        true,
      );
      expect(body).toContain(`# ${messages.compare.heading}\n`);
      const rows = body.split("\n").filter((line) => line.startsWith("| "));
      expect(rows).toHaveLength(COMPARE_ROWS.length + 2);
      expectEveryCellFootnoted(rows);
      expectVerdictWords(rows, messages.landing.compare.verdicts);
      for (const key of ["takeaway", "scope", "stronger"] as const)
        expect(body).toContain(messages.compare[key].replaceAll("|", "\\|"));
      expect(body).not.toContain(messages.compare.sourcesChecked.split("{date}")[0]);
      const { verdicts, rows: cells } = messages.landing.compare;
      const noneFound = `${verdicts.noneFound} ${cells.ci?.tolgee?.note}`;
      expect(body).toContain(noneFound.replaceAll("|", "\\|"));
      expect(body).not.toContain(`${verdicts.noneFound} - `);
      expect(body).toContain(`${verdicts.yes} - ${cells.ownKeys?.verbatra?.note}`);
      expectNumberedSources(body, lang);
      expect(body).not.toMatch(/\]\(\//);
      expect(body).toContain(
        absoluteMarkdownHref(lang === "en" ? "/docs/quickstart" : `/${lang}/docs/quickstart`),
      );
      expect(body).toMatch(/\/docs\/[^\s;)]*\.md\b/);
      for (const id of MACHINE_PROVIDER_IDS) expect(body).toContain(providerShortLabel(id));
    },
  );
});
