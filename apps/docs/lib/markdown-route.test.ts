import { describe, expect, it } from "vitest";
import {
  hasMarkdownVariant,
  isDocsPath,
  MARKDOWN_PAGES,
  markdownRewritePath,
  markdownUrl,
  prefersMarkdown,
} from "./markdown-route";

describe("markdownUrl", () => {
  it("appends .md to a page url, the docs index included", () => {
    expect(markdownUrl("/docs/formats")).toBe("/docs/formats.md");
    expect(markdownUrl("/de/docs")).toBe("/de/docs.md");
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
    ["/compare.md", "/en/compare.mdx"],
    ["/de/compare.md", "/de/compare.mdx"],
  ])("rewrites %s to %s", (pathname, expected) => {
    expect(markdownRewritePath(pathname, null)).toBe(expected);
  });

  it("rewrites the comparison page to markdown when the client asks for it", () => {
    expect(markdownRewritePath("/fr/compare", "text/markdown")).toBe("/fr/compare.mdx");
  });

  it("rewrites a docs page to markdown when the client asks for it", () => {
    expect(markdownRewritePath("/es/docs/providers", "text/markdown")).toBe(
      "/es/docs.mdx/providers",
    );
  });

  it.each([
    ["/docs/formats", "text/html"],
    ["/docs/formats", null],
    ["/privacy.md", null],
    ["/xx/docs/formats.md", null],
    ["/", "text/markdown"],
    ["/contact", "text/markdown"],
    ["/compare", "text/html"],
    ["/xx/compare.md", null],
    ["/de", "text/markdown"],
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
  it("lists the comparison as the one page outside the docs with a markdown variant", () => {
    expect(MARKDOWN_PAGES).toEqual(["/compare"]);
  });

  it.each([
    ["/docs/formats", true],
    ["/compare", true],
    ["/es/compare", true],
    ["/compare.md", true],
    ["/", false],
    ["/de", false],
    ["/privacy", false],
    ["/xx/compare", false],
  ])("classifies %s as having a markdown variant: %s", (pathname, expected) => {
    expect(hasMarkdownVariant(pathname)).toBe(expected);
  });
});
