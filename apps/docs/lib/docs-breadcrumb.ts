import type { Folder, Node, Root } from "fumadocs-core/page-tree";
import type { BreadcrumbLdItem } from "@/lib/structured-data";

function pathTo(nodes: ReadonlyArray<Node>, url: string): Node[] | undefined {
  for (const node of nodes) {
    if (node.type === "page" && node.url === url) return [node];
    if (node.type !== "folder") continue;
    if (node.index?.url === url) return [node, node.index];
    const rest = pathTo(node.children, url);
    if (rest) return [node, ...rest];
  }
  return undefined;
}

function folderUrl(folder: Folder): string | undefined {
  if (folder.index) return folder.index.url;
  const pages = folder.children.flatMap((child) => (child.type === "page" ? [child.url] : []));
  return pages.find((candidate) =>
    pages.every((other) => other === candidate || other.startsWith(`${candidate}/`)),
  );
}

function crumbFor(node: Node): { name: unknown; url: string | undefined } | undefined {
  if (node.type === "page") return { name: node.name, url: node.url };
  if (node.type === "folder" && !node.root) return { name: node.name, url: folderUrl(node) };
  return undefined;
}

function homeCrumb(tree: Root, homeUrl: string): BreadcrumbLdItem | undefined {
  const tab = tree.children.find(
    (node): node is Folder =>
      node.type === "folder" &&
      node.children.some((child) => child.type === "page" && child.url === homeUrl),
  );
  return typeof tab?.name === "string" ? { name: tab.name, url: homeUrl } : undefined;
}

export function docsBreadcrumbTrail(
  tree: Root,
  pageUrl: string,
  homeUrl: string,
): BreadcrumbLdItem[] {
  const home = homeCrumb(tree, homeUrl);
  const trail: BreadcrumbLdItem[] = home ? [home] : [];
  for (const node of pathTo(tree.children, pageUrl) ?? []) {
    const crumb = crumbFor(node);
    if (typeof crumb?.name !== "string" || !crumb.url) continue;
    if (trail.some((entry) => entry.url === crumb.url)) continue;
    trail.push({ name: crumb.name, url: crumb.url });
  }
  return trail;
}
