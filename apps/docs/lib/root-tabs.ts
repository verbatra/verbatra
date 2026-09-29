import type * as PageTree from "fumadocs-core/page-tree";
import type { LinkItemType } from "fumadocs-ui/layouts/shared";
import type { ReactNode } from "react";

export type RootTab = { id: string; title: ReactNode; url: string };

export function isRootFolder(node: PageTree.Node): node is PageTree.Folder {
  return node.type === "folder" && node.root !== undefined && node.root !== false;
}

function firstPageUrl(folder: PageTree.Folder): string | undefined {
  if (folder.index) return folder.index.url;
  for (const child of folder.children) {
    if (child.type === "page" && !child.external && !child.url.includes("#")) return child.url;
    if (child.type === "folder") {
      const url = firstPageUrl(child);
      if (url) return url;
    }
  }
  return undefined;
}

export function rootTabs(tree: PageTree.Root): RootTab[] {
  return tree.children.filter(isRootFolder).flatMap((folder) => {
    const url = firstPageUrl(folder);
    return url && folder.$id ? [{ id: folder.$id, title: folder.name, url }] : [];
  });
}

export function activeRootTab(
  tabs: ReadonlyArray<RootTab>,
  rootId: string | undefined,
): RootTab | undefined {
  return tabs.find((tab) => tab.id === rootId);
}

export function isRootTabLinkActive(
  url: string,
  tabs: ReadonlyArray<RootTab>,
  active: RootTab | undefined,
): boolean | undefined {
  if (!tabs.some((tab) => tab.url === url)) return undefined;
  return active?.url === url;
}

export function headerActiveTab(
  links: ReadonlyArray<LinkItemType>,
  tabs: ReadonlyArray<RootTab>,
  active: RootTab | undefined,
  isOwnMatch: (item: LinkItemType) => boolean,
): RootTab | undefined {
  const tabUrls = new Set(tabs.map((tab) => tab.url));
  const moreSpecific = links.some(
    (item) => "url" in item && item.url !== undefined && !tabUrls.has(item.url) && isOwnMatch(item),
  );
  return moreSpecific ? undefined : active;
}
