import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createTranslator } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import { i18n } from "@/lib/i18n";
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

const MESSAGES_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../../messages");

vi.mock("next-intl/server", () => ({
  getTranslations: async ({ locale, namespace }: { locale: string; namespace: string }) =>
    createTranslator({
      locale,
      messages: JSON.parse(readFileSync(join(MESSAGES_DIR, `${locale}.json`), "utf8")),
      namespace: namespace as never,
    }),
}));

const { GET, generateStaticParams } = await import("./route");

async function markdown(lang: string): Promise<Response> {
  return GET(new Request(`http://localhost/${lang}/compare.mdx`), {
    params: Promise.resolve({ lang }),
  });
}

describe("GET /[lang]/compare.mdx", () => {
  it("is generated for every locale", () => {
    expect(generateStaticParams()).toEqual(i18n.languages.map((lang) => ({ lang })));
  });

  it("answers an unknown locale with 404", async () => {
    expect((await markdown("xx")).status).toBe(404);
  });

  it.each(i18n.languages)(
    "serves the %s comparison as markdown with its canonical page",
    async (lang) => {
      const response = await markdown(lang);
      expect(response.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
      const path = lang === "en" ? "/compare" : `/${lang}/compare`;
      expect(response.headers.get("link")).toBe(
        `<https://verbatra.kreitz-webdev.de${path}>; rel="canonical"`,
      );
      const messages = JSON.parse(readFileSync(join(MESSAGES_DIR, `${lang}.json`), "utf8"));
      const body = await response.text();
      expect(body.startsWith(`---\ntitle: ${JSON.stringify(messages.compare.meta.title)}`)).toBe(
        true,
      );
      expect(body).toContain(`# ${messages.compare.heading}\n`);
      const rows = body.split("\n").filter((line) => line.startsWith("| "));
      expect(rows).toHaveLength(COMPARE_ROWS.length + 2);
      COMPARE_ROWS.forEach((row, index) => {
        const cells = (rows[index + 2] ?? "").split(/(?<!\\)\|/).slice(1, -1);
        expect(cells).toHaveLength(COMPARE_TOOLS.length + 1);
        COMPARE_TOOLS.forEach((tool, column) => {
          const cell = cells[column + 1]?.trim() ?? "";
          expect(cell.endsWith(`[${cellFootnote(row, tool)}]`), `${row}.${tool}`).toBe(true);
          expect(cell.length, `${row}.${tool}`).toBeGreaterThan(
            `[${cellFootnote(row, tool)}]`.length,
          );
        });
      });
      for (let footnote = 1; footnote <= COMPARE_SOURCE_COUNT; footnote += 1) {
        const line = body.split("\n").find((entry) => entry.startsWith(`${footnote}. `));
        expect(line, `${footnote}`).toBeDefined();
        for (const link of compareSource(footnote).urls) {
          const href = compareSourceHref(link, lang);
          expect(line).toContain(href.startsWith("/") ? absoluteMarkdownHref(href) : href);
        }
      }
      expect(body).not.toMatch(/\]\(\//);
      expect(body).toContain(
        absoluteMarkdownHref(lang === "en" ? "/docs/quickstart" : `/${lang}/docs/quickstart`),
      );
      expect(body).toMatch(/\/docs\/[^\s;)]*\.md\b/);
      for (const id of MACHINE_PROVIDER_IDS) expect(body).toContain(providerShortLabel(id));
    },
  );
});
