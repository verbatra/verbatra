import type * as PageTree from "fumadocs-core/page-tree";

function classed(className: string, name: PageTree.Node["name"]): PageTree.Node["name"] {
  return (
    <span key={className} className={className}>
      {name}
    </span>
  );
}

function withSubgroupLabels(node: PageTree.Node): PageTree.Node {
  if (node.type === "separator") return { ...node, name: classed("vk-sidebar-group", node.name) };
  if (node.type === "folder") return { ...node, children: node.children.map(withSubgroupLabels) };
  return node;
}

function withLabel(node: PageTree.Node): PageTree.Node {
  const labelled = { ...node, name: classed("vk-label", node.name) };
  return labelled.type === "folder"
    ? { ...labelled, children: labelled.children.map(withSubgroupLabels) }
    : labelled;
}

export function withGroupLabels(tree: PageTree.Root): PageTree.Root {
  return { ...tree, children: tree.children.map(withLabel) };
}
