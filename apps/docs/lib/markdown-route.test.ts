import { describe, expect, it } from "vitest";
import { isDocsPath, markdownRewritePath, markdownUrl, prefersMarkdown } from "./markdown-route";

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
  ])("rewrites %s to %s", (pathname, expected) => {
    expect(markdownRewritePath(pathname, null)).toBe(expected);
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
