import type * as PageTree from "fumadocs-core/page-tree";
import type { Node as StatusNode } from "fumadocs-core/source/plugins/status-badges";
import { getTranslations } from "next-intl/server";
import type { Locale } from "@/lib/i18n";

export async function withLlmsLinks(tree: PageTree.Root, locale: Locale): Promise<PageTree.Root> {
  const t = await getTranslations({ locale, namespace: "docs.llms" });
  const trailer: PageTree.Node[] = [
    { type: "separator", name: t("heading") },
    { type: "page", name: t("index"), url: "/llms.txt", external: true },
    { type: "page", name: t("full"), url: "/llms-full.txt", external: true },
  ];
  return { ...tree, children: [...tree.children, ...trailer] };
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
