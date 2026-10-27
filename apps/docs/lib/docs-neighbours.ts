import type { Item } from "fumadocs-core/page-tree";

export function footerNeighbourUrls(neighbours: {
  previous?: Item | undefined;
  next?: Item | undefined;
}): ReadonlySet<string> {
  const { previous, next } = neighbours;
  return new Set([previous?.url, next?.url].filter((url) => url !== undefined));
}

export function duplicatesFooter(
  href: string | undefined,
  neighbours: ReadonlySet<string>,
): boolean {
  return href !== undefined && neighbours.has(href);
}
