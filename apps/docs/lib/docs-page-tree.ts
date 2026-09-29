import type * as PageTree from "fumadocs-core/page-tree";
import { getTranslations } from "next-intl/server";
import type { Locale } from "@/lib/i18n";
import { isRootFolder } from "@/lib/root-tabs";

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

const COMMAND_PAGE = /\/docs\/cli\/([a-z-]+)$/;

function shortCommandLabel(page: PageTree.Item): PageTree.Item {
  const command = COMMAND_PAGE.exec(page.url)?.[1];
  if (command === undefined || page.name !== `verbatra ${command}`) return page;
  return { ...page, name: command };
}

function withShortLabels(node: PageTree.Node): PageTree.Node {
  if (node.type === "page") return shortCommandLabel(node);
  if (node.type !== "folder") return node;
  return {
    ...node,
    ...(node.index ? { index: shortCommandLabel(node.index) } : {}),
    children: node.children.map(withShortLabels),
  };
}

export function withShortCommandLabels(tree: PageTree.Root): PageTree.Root {
  return { ...tree, children: tree.children.map(withShortLabels) };
}
