import { describe, expect, it } from "vitest";
import { absoluteMarkdownHref, absolutizeMarkdownLinks, mapProse } from "./markdown-links";
import { SITE_URL } from "./site";

describe("absoluteMarkdownHref", () => {
  it.each([
    ["/docs/formats", `${SITE_URL}/docs/formats.md`],
    ["/docs", `${SITE_URL}/docs.md`],
    ["/docs/cli/init#providers", `${SITE_URL}/docs/cli/init.md#providers`],
    ["/de/docs/providers", `${SITE_URL}/de/docs/providers.md`],
    ["/fr/docs/", `${SITE_URL}/fr/docs.md`],
    ["/privacy", `${SITE_URL}/privacy`],
    ["/llms.txt", `${SITE_URL}/llms.txt`],
    ["/xx/docs/formats", `${SITE_URL}/xx/docs/formats`],
    ["/docs/formats.md", `${SITE_URL}/docs/formats.md`],
    ["/de/docs/cli/init.md#flags", `${SITE_URL}/de/docs/cli/init.md#flags`],
  ])("resolves %s to %s", (href, expected) => {
    expect(absoluteMarkdownHref(href)).toBe(expected);
  });
});

describe("absolutizeMarkdownLinks", () => {
  it("makes site-relative inline links absolute, pointing docs pages at their markdown", () => {
    expect(absolutizeMarkdownLinks("See [formats](/docs/formats) and [privacy](/privacy).")).toBe(
      `See [formats](${SITE_URL}/docs/formats.md) and [privacy](${SITE_URL}/privacy).`,
    );
  });

  it("keeps locale prefixes, anchors and link titles", () => {
    expect(absolutizeMarkdownLinks('[Init](/es/docs/cli/init#proveedores "Init")')).toBe(
      `[Init](${SITE_URL}/es/docs/cli/init.md#proveedores "Init")`,
    );
  });

  it("rewrites href attributes and reference definitions", () => {
    const markdown = '<Card href="/docs/quickstart" />\n[ref]: /de/docs/formats';
    expect(absolutizeMarkdownLinks(markdown)).toBe(
      `<Card href="${SITE_URL}/docs/quickstart.md" />\n[ref]: ${SITE_URL}/de/docs/formats.md`,
    );
  });

  it("rewrites angle-bracket link targets", () => {
    expect(absolutizeMarkdownLinks("[a](</docs/formats>) [b](</privacy#top>)")).toBe(
      `[a](<${SITE_URL}/docs/formats.md>) [b](<${SITE_URL}/privacy#top>)`,
    );
  });

  it("leaves anchor-only, external and protocol-relative links alone", () => {
    const markdown =
      "[a](#install) [b](https://github.com/verbatra/verbatra) [c](//cdn.example.com/x)";
    expect(absolutizeMarkdownLinks(markdown)).toBe(markdown);
  });

  it("leaves fenced code blocks untouched, including nested fences", () => {
    const markdown = [
      "````md",
      "```",
      "[x](/docs/formats)",
      "```",
      "[y](/docs/formats)",
      "````",
      "~~~",
      '<a href="/docs/cli">',
      "~~~",
      "[after](/docs/cli)",
    ].join("\n");
    const expected = markdown.replace("[after](/docs/cli)", `[after](${SITE_URL}/docs/cli.md)`);
    expect(absolutizeMarkdownLinks(markdown)).toBe(expected);
  });

  it("leaves inline code untouched while rewriting the prose around it", () => {
    expect(
      absolutizeMarkdownLinks("Run `[x](/docs/a)` or ``b`](/docs/b)`` then [c](/docs/c)"),
    ).toBe(`Run \`[x](/docs/a)\` or \`\`b\`](/docs/b)\`\` then [c](${SITE_URL}/docs/c.md)`);
  });

  it("still rewrites a line that holds an unmatched backtick", () => {
    expect(absolutizeMarkdownLinks("a ` b [c](/docs/c)")).toBe(`a \` b [c](${SITE_URL}/docs/c.md)`);
  });
});

describe("mapProse", () => {
  it("hands only prose spans to the mapper, never fenced or inline code", () => {
    const seen: string[] = [];
    const markdown = ["a `code` b", "```", "fenced", "```", "c"].join("\n");
    const result = mapProse(markdown, (text) => {
      seen.push(text);
      return text.toUpperCase();
    });
    expect(seen).toEqual(["a ", " b", "c"]);
    expect(result).toBe(["A `code` B", "```", "fenced", "```", "C"].join("\n"));
  });
});
