import { getBreadcrumbItemsFromPath } from "fumadocs-core/breadcrumb";
import type { Node } from "fumadocs-core/page-tree";
import type { ReactNode } from "react";

type CrumbTree = Parameters<typeof getBreadcrumbItemsFromPath>[0];

type Crumb = { readonly name: ReactNode; readonly url?: string | undefined };

export function crumbTrail(root: CrumbTree, path: ReadonlyArray<Node>): Crumb[] {
  return getBreadcrumbItemsFromPath(root, [...path], { includeRoot: true, includePage: true });
}

export function pageGroup(root: CrumbTree, path: ReadonlyArray<Node>): ReactNode | undefined {
  const folders = getBreadcrumbItemsFromPath(root, [...path], { includeRoot: true });
  return folders.at(-1)?.name;
}
