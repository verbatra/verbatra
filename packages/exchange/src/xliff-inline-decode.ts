import type { Element, Node } from "@xmldom/xmldom";
import { CDATA_SECTION_NODE, isElement, pushChildrenInOrder, TEXT_NODE } from "./xml-document.js";

export type InlineStep =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "wrap"; readonly before: string; readonly after: string }
  | { readonly kind: "unresolved" };

export type InlineHandler = (element: Element) => InlineStep;

interface Literal {
  readonly literal: string;
}

type Pending = Node | Literal;

function isLiteral(item: Pending): item is Literal {
  return "literal" in item;
}

function isTextNode(node: Node): boolean {
  return node.nodeType === TEXT_NODE || node.nodeType === CDATA_SECTION_NODE;
}

export function directText(element: Element): string {
  return Array.from(element.childNodes)
    .filter(isTextNode)
    .map((node) => node.nodeValue ?? "")
    .join("");
}

function expand(element: Element, step: InlineStep, pending: Pending[], parts: string[]): boolean {
  if (step.kind === "unresolved") {
    return false;
  }
  if (step.kind === "text") {
    parts.push(step.text);
    return true;
  }
  parts.push(step.before);
  pending.push({ literal: step.after });
  pushChildrenInOrder(pending, element);
  return true;
}

export function decodeInline(container: Element, handle: InlineHandler): string | undefined {
  const parts: string[] = [];
  const pending: Pending[] = [];
  pushChildrenInOrder(pending, container);
  for (let item = pending.pop(); item !== undefined; item = pending.pop()) {
    if (isLiteral(item)) {
      parts.push(item.literal);
    } else if (isTextNode(item)) {
      parts.push(item.nodeValue ?? "");
    } else if (isElement(item) && !expand(item, handle(item), pending, parts)) {
      return undefined;
    }
  }
  return parts.join("");
}
