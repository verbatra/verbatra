import { type HastNode, isBlank, visitParents } from "./hast";

const BADGE_SPACE: HastNode = { type: "text", value: " " };

const BADGE_HEADINGS: ReadonlySet<string> = new Set(["h2", "h3", "h4"]);

function isBadgeHeading(node: HastNode): boolean {
  return node.type === "element" && BADGE_HEADINGS.has(node.tagName ?? "");
}

function isAvailableFrom(node: HastNode | undefined): node is HastNode {
  return node?.type === "mdxJsxFlowElement" && node.name === "AvailableFrom";
}

function nextContentIndex(siblings: readonly HastNode[], from: number): number {
  let index = from;
  while (index < siblings.length && isBlank(siblings[index] as HastNode)) index += 1;
  return index;
}

function moveBadgesIntoHeadings(parent: HastNode): void {
  const siblings = parent.children ?? [];
  for (let index = 0; index < siblings.length; index += 1) {
    const heading = siblings[index] as HastNode;
    if (!isBadgeHeading(heading)) continue;
    const badgeIndex = nextContentIndex(siblings, index + 1);
    const badge = siblings[badgeIndex];
    if (!isAvailableFrom(badge)) continue;
    siblings.splice(index + 1, badgeIndex - index);
    heading.children = [
      ...(heading.children ?? []),
      BADGE_SPACE,
      { ...badge, type: "mdxJsxTextElement" },
    ];
  }
}

export function rehypeAvailableFromInHeading() {
  return (tree: HastNode) => visitParents(tree, moveBadgesIntoHeadings);
}
