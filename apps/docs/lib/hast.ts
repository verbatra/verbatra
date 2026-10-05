export type HastNode = {
  type: string;
  tagName?: string;
  name?: string | null;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
};

export function isElement(node: HastNode, tagName: string): boolean {
  return node.type === "element" && node.tagName === tagName;
}

export function childElements(node: HastNode, tagName: string): HastNode[] {
  return (node.children ?? []).filter((child) => isElement(child, tagName));
}

export function textContent(node: HastNode): string {
  if (node.type === "text") return node.value ?? "";
  return (node.children ?? []).map(textContent).join("");
}

export function isBlank(node: HastNode): boolean {
  return node.type === "text" && (node.value ?? "").trim() === "";
}

export function visitParents(node: HastNode, visit: (parent: HastNode) => void): void {
  if (node.children === undefined) return;
  visit(node);
  for (const child of node.children) visitParents(child, visit);
}
