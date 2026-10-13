import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loader, type MetaData, type VirtualFile } from "fumadocs-core/source";
import { describe, expect, it } from "vitest";
import { docsBreadcrumbTrail } from "@/lib/docs-breadcrumb";
import { i18n, localizedPath } from "@/lib/i18n";
import { breadcrumbListLd } from "@/lib/structured-data";

const CONTENT_DIR = join(import.meta.dirname, "../content/docs");

function virtualFiles(): VirtualFile[] {
  return readdirSync(CONTENT_DIR, { recursive: true, encoding: "utf8" })
    .sort()
    .flatMap((file): VirtualFile[] => {
      const text = (): string => readFileSync(join(CONTENT_DIR, file), "utf8");
      if (file.endsWith(".mdx")) {
        return [{ type: "page", path: file, data: { title: /^title: (.+)$/m.exec(text())?.[1] } }];
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
  const trail = docsBreadcrumbTrail(tree, localizedPath(lang, path), localizedPath(lang, "/docs"));
  return breadcrumbListLd({ items: trail }).itemListElement;
}

describe("docsBreadcrumbTrail", () => {
  it.each(["en", "de"] as const)(
    "links a folder with an index page to that page, so %s /docs/cli/check reads Docs > CLI > check",
    (lang) => {
      const prefix = lang === "en" ? "" : `/${lang}`;
      expect(listFor(lang, "/docs/cli/check")).toEqual([
        { "@type": "ListItem", position: 1, name: "Docs", item: `${SITE}${prefix}/docs` },
        { "@type": "ListItem", position: 2, name: "CLI", item: `${SITE}${prefix}/docs/cli` },
        {
          "@type": "ListItem",
          position: 3,
          name: "verbatra check",
          item: `${SITE}${prefix}/docs/cli/check`,
        },
      ]);
    },
  );

  it("drops a folder with no page of its own and keeps positions in order", () => {
    expect(listFor("en", "/docs/providers")).toEqual([
      { "@type": "ListItem", position: 1, name: "Docs", item: `${SITE}/docs` },
      { "@type": "ListItem", position: 2, name: "Providers", item: `${SITE}/docs/providers` },
    ]);
  });

  it("does not repeat a folder whose index is the page itself", () => {
    expect(listFor("en", "/docs/cli")).toEqual([
      { "@type": "ListItem", position: 1, name: "Docs", item: `${SITE}/docs` },
      { "@type": "ListItem", position: 2, name: "CLI", item: `${SITE}/docs/cli` },
    ]);
  });
});
