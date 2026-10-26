import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loader, type MetaData, type VirtualFile } from "fumadocs-core/source";
import { describe, expect, it } from "vitest";
import {
  breadcrumbItems,
  docsBreadcrumbTrail,
  eyebrowTrail,
  pagePath,
  VISIBLE_BREADCRUMB_OPTIONS,
  visibleTrail,
} from "@/lib/docs-breadcrumb";
import { i18n, localizedPath } from "@/lib/i18n";
import { breadcrumbListLd } from "@/lib/structured-data";

const CONTENT_DIR = join(import.meta.dirname, "../content/docs");

function virtualFiles(): VirtualFile[] {
  return readdirSync(CONTENT_DIR, { recursive: true, encoding: "utf8" })
    .sort()
    .flatMap((file): VirtualFile[] => {
      const text = (): string => readFileSync(join(CONTENT_DIR, file), "utf8");
      if (file.endsWith(".mdx")) {
        const title = /^title: (.+)$/m.exec(text())?.[1]?.replace(/^"(.*)"$/, "$1");
        return [{ type: "page", path: file, data: { title } }];
      }
      if (file.endsWith(".json")) {
        return [{ type: "meta", path: file, data: JSON.parse(text()) as MetaData }];
      }
      return [];
    });
}

const docs = loader({ baseUrl: "/docs", i18n, source: { files: virtualFiles() } });

const SITE = "https://verbatra.kreitz-webdev.de";

function listFor(lang: "en" | "de", path: string): unknown {
  const tree = docs.getPageTree(lang);
  const trail = docsBreadcrumbTrail(tree, localizedPath(lang, path));
  return breadcrumbListLd({ items: trail }).itemListElement;
}

function visibleNames(lang: "en" | "de", path: string): unknown[] {
  const tree = docs.getPageTree(lang);
  const trailPath = pagePath(tree, localizedPath(lang, path));
  return breadcrumbItems(tree, trailPath, VISIBLE_BREADCRUMB_OPTIONS).map((item) => item.name);
}

describe("docsBreadcrumbTrail", () => {
  it.each(["en", "de"] as const)(
    "follows the visible breadcrumb, without the tab crumb, so %s /docs/cli/check reads CLI > check",
    (lang) => {
      const prefix = lang === "en" ? "" : `/${lang}`;
      expect(visibleNames(lang, "/docs/cli/check")).toEqual(["CLI", "verbatra check"]);
      expect(listFor(lang, "/docs/cli/check")).toEqual([
        { "@type": "ListItem", position: 1, name: "CLI", item: `${SITE}${prefix}/docs/cli` },
        {
          "@type": "ListItem",
          position: 2,
          name: "verbatra check",
          item: `${SITE}${prefix}/docs/cli/check`,
        },
      ]);
    },
  );

  it("drops a visible crumb that has no page to link to and keeps positions in order", () => {
    expect(visibleNames("en", "/docs/providers")).toEqual(["Configuration", "Providers"]);
    expect(listFor("en", "/docs/providers")).toEqual([
      { "@type": "ListItem", position: 1, name: "Providers", item: `${SITE}/docs/providers` },
    ]);
  });

  it("does not repeat a folder whose page is the page itself", () => {
    expect(listFor("en", "/docs/cli")).toEqual([
      { "@type": "ListItem", position: 1, name: "CLI reference", item: `${SITE}/docs/cli` },
    ]);
  });

  it("names no crumb the visible trail does not show, on every page", () => {
    for (const lang of ["en", "de"] as const) {
      const tree = docs.getPageTree(lang);
      for (const page of docs.getPages(lang)) {
        const visible = new Set(visibleTrail(tree, pagePath(tree, page.url)).map((i) => i.name));
        for (const crumb of docsBreadcrumbTrail(tree, page.url)) {
          expect(visible.has(crumb.name), `${page.url}: ${crumb.name}`).toBe(true);
        }
      }
    }
  });
});

describe("the visible trail", () => {
  it("starts at the tab and ends at the page, in order", () => {
    const tree = docs.getPageTree("en");
    const names = visibleTrail(tree, pagePath(tree, "/docs/cli/check")).map((item) => item.name);
    expect(names).toEqual(["Reference", "CLI", "verbatra check"]);
  });

  it("prefixes the eyebrow with the tab, and shows only the tab for a page directly under it", () => {
    const tree = docs.getPageTree("en");
    expect(eyebrowTrail(tree, pagePath(tree, "/docs/cli/check"))).toEqual(["Reference", "CLI"]);
    expect(eyebrowTrail(tree, pagePath(tree, "/docs/error-codes"))).toEqual(["Reference"]);
  });

  it("names nothing for a url that is not a page", () => {
    const tree = docs.getPageTree("en");
    expect(eyebrowTrail(tree, pagePath(tree, "/docs/does-not-exist"))).toEqual([]);
  });
});
