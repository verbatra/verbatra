import { getBreadcrumbItemsFromPath, searchPath } from "fumadocs-core/breadcrumb";
import type { Folder, Node, Root } from "fumadocs-core/page-tree";
import type { BreadcrumbLdItem } from "@/lib/structured-data";

export const VISIBLE_BREADCRUMB_OPTIONS = { includePage: true } as const;

type TrailOptions = Parameters<typeof getBreadcrumbItemsFromPath>[2];

function isFolder(node: Node): node is Folder {
  return node.type === "folder";
}

function isRootFolder(node: Node): node is Folder {
  return isFolder(node) && node.root !== undefined && node.root !== false;
}

function folderUrl(folder: Folder): string | undefined {
  if (folder.index) return folder.index.url;
  const pages = folder.children.flatMap((child) => (child.type === "page" ? [child.url] : []));
  return pages.find((candidate) =>
    pages.every((other) => other === candidate || other.startsWith(`${candidate}/`)),
  );
}

function folderUrlByName(folders: ReadonlyArray<Folder>, name: unknown): string | undefined {
  const folder = folders.find((candidate) => candidate.name === name);
  return folder === undefined ? undefined : folderUrl(folder);
}

export function breadcrumbItems(tree: Root, path: ReadonlyArray<Node>, options: TrailOptions) {
  return getBreadcrumbItemsFromPath(path.findLast(isRootFolder) ?? tree, [...path], options);
}

export function pagePath(tree: Root, pageUrl: string): Node[] {
  return searchPath(tree.children, pageUrl) ?? [];
}

export function visibleTrail(tree: Root, path: ReadonlyArray<Node>) {
  return breadcrumbItems(tree, path, { includeRoot: true, includePage: true });
}

export function eyebrowTrail(tree: Root, path: ReadonlyArray<Node>): string[] {
  return breadcrumbItems(tree, path, { includeRoot: true }).flatMap((item) =>
    typeof item.name === "string" ? [item.name] : [],
  );
}

export function docsBreadcrumbTrail(tree: Root, pageUrl: string): BreadcrumbLdItem[] {
  const path = pagePath(tree, pageUrl);
  const folders = path.filter(isFolder);
  const crumbs = breadcrumbItems(tree, path, VISIBLE_BREADCRUMB_OPTIONS).map((item) => ({
    name: item.name,
    url: item.url ?? folderUrlByName(folders, item.name),
  }));
  return crumbs.flatMap((crumb, index) => {
    if (typeof crumb.name !== "string" || !crumb.url) return [];
    if (crumbs.slice(index + 1).some((later) => later.url === crumb.url)) return [];
    return [{ name: crumb.name, url: crumb.url }];
  });
}
