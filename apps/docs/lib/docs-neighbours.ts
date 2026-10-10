import { findNeighbour, type Root } from "fumadocs-core/page-tree";

export function footerNeighbourUrls(tree: Root, url: string): ReadonlySet<string> {
  const { previous, next } = findNeighbour(tree, url);
  return new Set([previous?.url, next?.url].filter((neighbour) => neighbour !== undefined));
}

export function duplicatesFooter(
  href: string | undefined,
  neighbours: ReadonlySet<string>,
): boolean {
  return href !== undefined && neighbours.has(href);
}
