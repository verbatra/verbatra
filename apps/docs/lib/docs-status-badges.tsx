import type * as PageTree from "fumadocs-core/page-tree";
import type { Item, Node as StatusNode } from "fumadocs-core/source/plugins/status-badges";
import { getTranslations } from "next-intl/server";
import { NewBadge } from "@/components/new-badge";
import type { Locale } from "@/lib/i18n";

const STATUS_KEYS = ["new"] as const;

type StatusKey = (typeof STATUS_KEYS)[number];

type StatusLabel = (status: StatusKey) => string;

function isStatusKey(status: string | undefined): status is StatusKey {
  return STATUS_KEYS.some((key) => key === status);
}

function badgedItem(item: Item, label: StatusLabel): Item {
  if (!isStatusKey(item.status)) return item;
  return {
    ...item,
    name: (
      <>
        {item.name}
        <NewBadge>{label(item.status)}</NewBadge>
      </>
    ),
  };
}

function badged(node: StatusNode, label: StatusLabel): StatusNode {
  if (node.type === "page") return badgedItem(node, label);
  if (node.type !== "folder") return node;
  return {
    ...node,
    ...(node.index ? { index: badgedItem(node.index, label) } : {}),
    children: node.children.map((child) => badged(child, label)),
  };
}

export async function withStatusBadges(
  tree: PageTree.Root,
  locale: Locale,
): Promise<PageTree.Root> {
  const t = await getTranslations({ locale, namespace: "docs.statusBadges" });
  return {
    ...tree,
    children: (tree.children as StatusNode[]).map((node) => badged(node, (status) => t(status))),
  };
}
