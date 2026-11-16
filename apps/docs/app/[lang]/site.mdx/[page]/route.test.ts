import { describe, expect, it, vi } from "vitest";
import { i18n } from "@/lib/i18n";
import { SITE_MARKDOWN_PAGES, siteMarkdownSlug } from "@/lib/markdown-route";

vi.mock(
  "next-intl/server",
  async () => (await import("@/test-support/catalog-intl")).catalogIntlServer,
);

const { GET, generateStaticParams } = await import("./route");

async function markdown(lang: string, page = "index"): Promise<Response> {
  return GET(new Request(`http://localhost/${lang}/site.mdx/${page}`), {
    params: Promise.resolve({ lang, page }),
  });
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
    expect((await markdown("en", "compare")).status).toBe(404);
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
});
