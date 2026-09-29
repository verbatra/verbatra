import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { type Folder, flattenTree, type Root } from "fumadocs-core/page-tree";
import { loader, type MetaData, type VirtualFile } from "fumadocs-core/source";
import { describe, expect, it } from "vitest";
import { i18n } from "@/lib/i18n";

const CONTENT_DIR = join(import.meta.dirname, "../content/docs");

function contentFiles(): string[] {
  return readdirSync(CONTENT_DIR, { recursive: true, encoding: "utf8" }).sort();
}

function frontmatterTitle(file: string): string {
  const source = readFileSync(join(CONTENT_DIR, file), "utf8");
  return /^title: (.+)$/m.exec(source)?.[1] ?? file;
}

function virtualFiles(): VirtualFile[] {
  return contentFiles().flatMap((file): VirtualFile[] => {
    if (file.endsWith(".mdx")) {
      return [{ type: "page", path: file, data: { title: frontmatterTitle(file) } }];
    }
    if (file.endsWith(".json")) {
      const data = JSON.parse(readFileSync(join(CONTENT_DIR, file), "utf8")) as MetaData;
      return [{ type: "meta", path: file, data }];
    }
    return [];
  });
}

const docs = loader({ baseUrl: "/docs", i18n, source: { files: virtualFiles() } });

function pageUrls(tree: Root | Folder): string[] {
  return flattenTree(tree.children)
    .filter((item) => !item.external && !item.url.includes("#"))
    .map((item) => item.url);
}

function rootFolders(tree: Root): Folder[] {
  return tree.children.filter((node): node is Folder => node.type === "folder" && !!node.root);
}

describe("docs sidebar", () => {
  describe.each(i18n.languages)("%s", (locale) => {
    const tree = docs.getPageTree(locale);

    it("splits the sidebar into the Docs and Reference tabs and nothing else", () => {
      expect(tree.children).toHaveLength(2);
      expect(rootFolders(tree)).toHaveLength(2);
    });

    it("lists every page exactly once across the two tabs", () => {
      const listed = rootFolders(tree).flatMap(pageUrls);
      const pages = docs.getPages(locale).map((page) => page.url);
      expect(new Set(listed).size).toBe(listed.length);
      expect([...listed].sort()).toEqual([...pages].sort());
    });

    it("opens the Docs tab on the introduction and the Reference tab on the CLI overview", () => {
      const [docsTab, referenceTab] = rootFolders(tree);
      const prefix = locale === i18n.defaultLanguage ? "" : `/${locale}`;
      expect(docsTab ? pageUrls(docsTab)[0] : undefined).toBe(`${prefix}/docs`);
      expect(referenceTab ? pageUrls(referenceTab)[0] : undefined).toBe(`${prefix}/docs/cli`);
    });

    it("opens Get started by default and leaves the other groups closed", () => {
      const [docsTab] = rootFolders(tree);
      const prefix = locale === i18n.defaultLanguage ? "" : `/${locale}`;
      const groups = (docsTab?.children ?? []).filter(
        (node): node is Folder => node.type === "folder",
      );
      const open = groups.filter((group) => group.defaultOpen === true);
      expect(open.map((group) => pageUrls(group)[0])).toEqual([`${prefix}/docs/quickstart`]);
    });

    it("keeps every link in the sidebar inside this locale", () => {
      const prefix = locale === i18n.defaultLanguage ? "/docs" : `/${locale}/docs`;
      const internal = flattenTree(tree.children).filter((item) => !item.external);
      for (const item of internal) expect(item.url.startsWith(prefix)).toBe(true);
    });
  });

  it("keeps the URL of every page free of its sidebar group", () => {
    const urls = docs.getPages(i18n.defaultLanguage).map((page) => page.url);
    expect(urls.filter((url) => url.includes("("))).toEqual([]);
    expect(urls).toContain("/docs/quickstart");
    expect(urls).toContain("/docs/network-policy");
  });
});
