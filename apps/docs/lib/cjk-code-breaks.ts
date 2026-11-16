import { type HastNode, isElement, visitParents } from "./hast";

const BREAK_AFTER = /[、，；：]$/u;

const lineBreakOpportunity = (): HastNode => ({
  type: "element",
  tagName: "wbr",
  properties: {},
  children: [],
});

function endsClause(node: HastNode | undefined): boolean {
  return node?.type === "text" && BREAK_AFTER.test(node.value ?? "");
}

function breakBeforeCode(parent: HastNode): void {
  const children = parent.children ?? [];
  parent.children = children.flatMap((child, index) =>
    isElement(child, "code") && endsClause(children[index - 1])
      ? [lineBreakOpportunity(), child]
      : [child],
  );
}

export function rehypeCjkCodeBreaks() {
  return (tree: HastNode) => visitParents(tree, breakBeforeCode);
}
