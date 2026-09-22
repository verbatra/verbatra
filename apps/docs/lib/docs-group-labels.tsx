import type * as PageTree from "fumadocs-core/page-tree";

function labelled(name: PageTree.Node["name"]): PageTree.Node["name"] {
  return (
    <span key="group-label" className="vk-label">
      {name}
    </span>
  );
}

function withLabel(node: PageTree.Node): PageTree.Node {
  return { ...node, name: labelled(node.name) };
}

export function withGroupLabels(tree: PageTree.Root): PageTree.Root {
  return { ...tree, children: tree.children.map(withLabel) };
}
