import { describe, expect, it } from "vitest";
import { i18n } from "./i18n";
import {
  hasMarkdownVariant,
  isDocsPath,
  isMdxPath,
  MARKDOWN_PAGES,
  markdownRewritePath,
  markdownUrl,
  mdxRedirectPath,
  prefersMarkdown,
  SITE_MARKDOWN_PAGES,
  siteMarkdownPage,
  siteMarkdownSlug,
  siteMarkdownUrl,
} from "./markdown-route";

describe("markdownUrl", () => {
  it("appends .md to a page url, the docs index included", () => {
    expect(markdownUrl("/docs/formats")).toBe("/docs/formats.md");
    expect(markdownUrl("/de/docs")).toBe("/de/docs.md");
    expect(markdownUrl("/fr/privacy")).toBe("/fr/privacy.md");
  });

  it("gives the landing page an index.md in every locale", () => {
    expect(markdownUrl("/")).toBe("/index.md");
    expect(markdownUrl("/de")).toBe("/de/index.md");
  });
});

describe("prefersMarkdown", () => {
  it.each([
    ["text/markdown", true],
    ["text/markdown, text/html;q=0.9", true],
    ["text/html, text/markdown;q=0.5", false],
    ["text/html,application/xhtml+xml,*/*;q=0.8", false],
    ["text/markdown;q=0", false],
    ["*/*", false],
    [null, false],
  ])("reads %s as markdown preferred: %s", (accept, expected) => {
    expect(prefersMarkdown(accept)).toBe(expected);
  });
});

describe("markdownRewritePath", () => {
  it.each([
    ["/docs.md", "/en/docs.mdx"],
    ["/docs/formats.md", "/en/docs.mdx/formats"],
    ["/docs/cli/translate.md", "/en/docs.mdx/cli/translate"],
    ["/de/docs/formats.md", "/de/docs.mdx/formats"],
    ["/fr/docs.md", "/fr/docs.mdx"],
    ["/compare.md", "/en/site.mdx/compare"],
    ["/de/compare.md", "/de/site.mdx/compare"],
    ["/index.md", "/en/site.mdx/index"],
    ["/fr/index.md", "/fr/site.mdx/index"],
    ["/imprint.md", "/en/site.mdx/imprint"],
    ["/es/privacy.md", "/es/site.mdx/privacy"],
    ["/licenses.md", "/en/site.mdx/licenses"],
    ["/de/contact.md", "/de/site.mdx/contact"],
  ])("rewrites %s to %s", (pathname, expected) => {
    expect(markdownRewritePath(pathname, null)).toBe(expected);
  });

  it("rewrites the comparison page to markdown when the client asks for it", () => {
    expect(markdownRewritePath("/fr/compare", "text/markdown")).toBe("/fr/site.mdx/compare");
  });

  it.each([
    ["/", "/en/site.mdx/index"],
    ["/de", "/de/site.mdx/index"],
    ["/contact", "/en/site.mdx/contact"],
  ])("rewrites %s to markdown when the client asks for it", (pathname, expected) => {
    expect(markdownRewritePath(pathname, "text/markdown")).toBe(expected);
  });

  it("rewrites a docs page to markdown when the client asks for it", () => {
    expect(markdownRewritePath("/es/docs/providers", "text/markdown")).toBe(
      "/es/docs.mdx/providers",
    );
  });

  it.each([
    ["/docs/formats", "text/html"],
    ["/docs/formats", null],
    ["/xx/docs/formats.md", null],
    ["/", "text/html"],
    ["/de", null],
    ["/index", "text/markdown"],
    ["/xx/index.md", null],
    ["/de.md", null],
    ["/compare", "text/html"],
    ["/xx/compare.md", null],
    ["/terms.md", null],
    ["/compare/extra.md", null],
  ])("leaves %s (Accept %s) alone", (pathname, accept) => {
    expect(markdownRewritePath(pathname, accept)).toBeNull();
  });
});

describe("isDocsPath", () => {
  it.each([
    ["/docs", true],
    ["/de/docs/formats", true],
    ["/docs/formats.md", true],
    ["/", false],
    ["/xx/docs", false],
    ["/privacy", false],
  ])("classifies %s as a docs path: %s", (pathname, expected) => {
    expect(isDocsPath(pathname)).toBe(expected);
  });
});

describe("hasMarkdownVariant", () => {
  it("lists the comparison and the legal pages as the pages beside the landing with a markdown variant", () => {
    expect(MARKDOWN_PAGES).toEqual(["/compare", "/imprint", "/privacy", "/licenses", "/contact"]);
  });

  it.each([
    ["/docs/formats", true],
    ["/compare", true],
    ["/es/compare", true],
    ["/compare.md", true],
    ["/", true],
    ["/de", true],
    ["/index.md", true],
    ["/privacy", true],
    ["/index", false],
    ["/xx/compare", false],
    ["/terms", false],
  ])("classifies %s as having a markdown variant: %s", (pathname, expected) => {
    expect(hasMarkdownVariant(pathname)).toBe(expected);
  });
});

describe("site markdown pages", () => {
  it("names each page by a slug that maps back to it", () => {
    for (const page of SITE_MARKDOWN_PAGES) {
      expect(siteMarkdownPage(siteMarkdownSlug(page))).toBe(page);
    }
    expect(siteMarkdownSlug("/")).toBe("index");
    expect(siteMarkdownPage("unknown")).toBeNull();
  });

  it("gives every page a public markdown url per locale that rewrites to its route", () => {
    for (const locale of i18n.languages) {
      for (const page of SITE_MARKDOWN_PAGES) {
        const url = siteMarkdownUrl(locale, page);
        expect(markdownRewritePath(url, null)).toBe(
          `/${locale}/site.mdx/${siteMarkdownSlug(page)}`,
        );
      }
    }
    expect(siteMarkdownUrl("en", "/")).toBe("/index.md");
    expect(siteMarkdownUrl("de", "/")).toBe("/de/index.md");
    expect(siteMarkdownUrl("fr", "/imprint")).toBe("/fr/imprint.md");
  });
});

describe(".mdx urls", () => {
  it.each([
    ["/docs/quickstart.mdx", true],
    ["/docs.mdx/formats", true],
    ["/site.mdx/index", true],
    ["/docs/quickstart.md", false],
    ["/compare", false],
  ])("classifies %s as an .mdx url: %s", (pathname, expected) => {
    expect(isMdxPath(pathname)).toBe(expected);
  });

  it.each([
    ["/docs/quickstart.mdx", "/docs/quickstart.md"],
    ["/de/docs.mdx", "/de/docs.md"],
    ["/docs.mdx/cli/translate", "/docs/cli/translate.md"],
    ["/en/docs.mdx/formats", "/docs/formats.md"],
    ["/compare.mdx", "/compare.md"],
    ["/es/compare.mdx", "/es/compare.md"],
    ["/index.mdx", "/index.md"],
    ["/fr/index.mdx", "/fr/index.md"],
    ["/site.mdx/index", "/index.md"],
    ["/de/site.mdx/privacy", "/de/privacy.md"],
  ])("sends %s to %s", (pathname, expected) => {
    expect(mdxRedirectPath(pathname)).toBe(expected);
  });

  it.each([
    "/nothing.mdx",
    "/xx/docs.mdx/formats",
    "/xx/site.mdx/index",
    "/site.mdx/unknown",
    "/de.mdx",
    "/docs/quickstart.md",
  ])("finds no markdown url for %s", (pathname) => {
    expect(mdxRedirectPath(pathname)).toBeNull();
  });
});
