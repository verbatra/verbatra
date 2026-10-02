import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { getTableOfContents } from "fumadocs-core/content/toc";
import { describe, expect, it } from "vitest";
import { i18n, type Locale } from "@/lib/i18n";

const CONTENT_DIR = join(import.meta.dirname, "../content/docs");
const LINK_PATTERN = /(?:\]\(|href="|href: ")(\/docs[^)"#\s]*)?#([^)"\s]+)[)"]/g;

type DocFile = { slug: string; locale: Locale; path: string };

function listDocFiles(): DocFile[] {
  return readdirSync(CONTENT_DIR, { recursive: true, encoding: "utf8" })
    .filter((file) => file.endsWith(".mdx"))
    .map((file) => {
      const [base = "", suffix] = file.replace(/\.mdx$/, "").split(".");
      const locale = (suffix ?? i18n.defaultLanguage) as Locale;
      const parts = base.split("/").filter((part) => !/^\(.+\)$/.test(part));
      if (parts.at(-1) === "index") parts.pop();
      return { slug: ["/docs", ...parts].join("/"), locale, path: join(CONTENT_DIR, file) };
    });
}

const FILES = listDocFiles();
const anchorCache = new Map<string, ReadonlySet<string>>();

function anchorsOf(file: DocFile): ReadonlySet<string> {
  const cached = anchorCache.get(file.path);
  if (cached) return cached;
  const anchors = new Set(
    getTableOfContents(readFileSync(file.path, "utf8")).map((item) =>
      decodeURIComponent(item.url.slice(1)),
    ),
  );
  anchorCache.set(file.path, anchors);
  return anchors;
}

function brokenAnchors(file: DocFile): string[] {
  const broken: string[] = [];
  for (const [, slug, anchor = ""] of readFileSync(file.path, "utf8").matchAll(LINK_PATTERN)) {
    const target = slug
      ? FILES.find((candidate) => candidate.slug === slug && candidate.locale === file.locale)
      : file;
    if (target && !anchorsOf(target).has(decodeURIComponent(anchor))) {
      broken.push(`${slug ?? ""}#${anchor}`);
    }
  }
  return broken;
}

describe("docs anchor links", () => {
  it("finds MDX pages in every locale", () => {
    for (const locale of i18n.languages) {
      expect(FILES.some((file) => file.locale === locale)).toBe(true);
    }
  });

  it.each(FILES.map((file) => [relative(CONTENT_DIR, file.path), file] as const))(
    "%s links only to headings that exist in the same locale",
    (_name, file) => {
      expect(brokenAnchors(file)).toEqual([]);
    },
  );
});
