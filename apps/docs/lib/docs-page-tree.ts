import type * as PageTree from "fumadocs-core/page-tree";
import type { Node as StatusNode } from "fumadocs-core/source/plugins/status-badges";
import type { LayoutTab } from "fumadocs-ui/layouts/shared";
import { getTranslations } from "next-intl/server";
import type { Locale } from "@/lib/i18n";

function isRootFolder(node: PageTree.Node): node is PageTree.Folder {
  return node.type === "folder" && node.root !== undefined && node.root !== false;
}

function appendToRoots(tree: PageTree.Root, trailer: PageTree.Node[]): PageTree.Root {
  if (!tree.children.some(isRootFolder)) {
    return { ...tree, children: [...tree.children, ...trailer] };
  }
  return {
    ...tree,
    children: tree.children.map((node) =>
      isRootFolder(node) ? { ...node, children: [...node.children, ...trailer] } : node,
    ),
  };
}

export async function withLlmsLinks(tree: PageTree.Root, locale: Locale): Promise<PageTree.Root> {
  const t = await getTranslations({ locale, namespace: "docs.llms" });
  return appendToRoots(tree, [
    { type: "separator", name: t("heading") },
    { type: "page", name: t("index"), url: "/llms.txt", external: true },
    { type: "page", name: t("full"), url: "/llms-full.txt", external: true },
  ]);
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

export function rootTabs(tree: PageTree.Root): LayoutTab[] {
  return tree.children.filter(isRootFolder).flatMap((folder) => {
    const url = firstPageUrl(folder);
    return url ? [{ url, title: folder.name, $folder: folder }] : [];
  });
}

function markExpanded(node: StatusNode): { node: StatusNode; hasNew: boolean } {
  if (node.type === "folder") {
    const children = node.children.map(markExpanded);
    const hasNew = children.some((child) => child.hasNew) || node.index?.status === "new";
    return {
      node: {
        ...node,
        children: children.map((child) => child.node),
        ...(hasNew ? { defaultOpen: true } : {}),
      },
      hasNew,
    };
  }
  return { node, hasNew: node.type === "page" && node.status === "new" };
}

export function withExpandedNewGroups(tree: PageTree.Root): PageTree.Root {
  return {
    ...tree,
    children: (tree.children as StatusNode[]).map((node) => markExpanded(node).node),
  };
}
