import { DOMParser, type Document, type Element, type Node } from "@xmldom/xmldom";
import { AdapterError } from "../errors.js";
import { MAX_DEPTH } from "../json/limits.js";

export type XliffVersion = "1.2" | "2.0";

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;
const CDATA_SECTION_NODE = 4;

const XLIFF_NAMESPACES = new Set([
  "urn:oasis:names:tc:xliff:document:1.2",
  "urn:oasis:names:tc:xliff:document:2.0",
]);

const SHARED_INLINE_ELEMENTS = ["x", "g", "bx", "ex", "ph", "it", "mrk"] as const;

const INLINE_ELEMENTS: Readonly<Record<XliffVersion, ReadonlySet<string>>> = {
  "1.2": new Set([...SHARED_INLINE_ELEMENTS, "bpt", "ept"]),
  "2.0": new Set([...SHARED_INLINE_ELEMENTS, "pc", "sc", "ec", "sm", "em", "cp"]),
};

const XLIFF_20_CODE_ATTRIBUTES = [
  "id",
  "equiv",
  "disp",
  "dataRef",
  "subType",
  "type",
  "canCopy",
  "canDelete",
  "canReorder",
  "canOverlap",
  "copyOf",
  "dir",
  "isolated",
] as const;

const INLINE_ELEMENT_ATTRIBUTES: Readonly<Record<string, readonly string[]>> = {
  x: ["id", "ctype", "equiv-text"],
  g: ["id", "ctype", "equiv-text"],
  bx: ["id", "rid", "ctype", "equiv-text"],
  ex: ["id", "rid", "equiv-text"],
  bpt: ["id", "rid", "ctype", "equiv-text"],
  ept: ["id", "rid", "equiv-text"],
  it: ["id", "pos", "ctype", "equiv-text"],
  ph: ["ctype", "equiv-text", ...XLIFF_20_CODE_ATTRIBUTES],
  mrk: ["id", "mtype", "translate", "type", "value"],
  pc: [
    "id",
    "equivStart",
    "equivEnd",
    "dispStart",
    "dispEnd",
    "dataRefStart",
    "dataRefEnd",
    "subType",
    "type",
    "canCopy",
    "canDelete",
    "canReorder",
    "canOverlap",
    "copyOf",
    "dir",
  ],
  sc: XLIFF_20_CODE_ATTRIBUTES,
  ec: ["startRef", ...XLIFF_20_CODE_ATTRIBUTES],
  sm: ["id", "translate", "type", "value"],
  em: ["startRef"],
  cp: ["hex"],
};

const INLINE_TAG = /<\/?([A-Za-z][\w.-]*)(?:\s[^<>]*)?\/?>/g;

function isElement(node: Node): node is Element {
  return node.nodeType === ELEMENT_NODE;
}

function escapeText(text: string): string {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function escapeAttribute(value: string): string {
  return escapeText(value).replaceAll('"', "&quot;");
}

function isNamespaceDeclaration(name: string): boolean {
  return name === "xmlns" || name.startsWith("xmlns:");
}

function elementName(element: Element): string {
  const namespace = element.namespaceURI;
  if (namespace !== null && XLIFF_NAMESPACES.has(namespace)) {
    return element.localName ?? element.nodeName;
  }
  return element.nodeName;
}

function attributeMarkup(element: Element): string {
  let markup = "";
  for (let i = 0; i < element.attributes.length; i += 1) {
    const attr = element.attributes.item(i);
    if (attr !== null && !isNamespaceDeclaration(attr.name)) {
      markup += ` ${attr.name}="${escapeAttribute(attr.value)}"`;
    }
  }
  return markup;
}

function childrenValue(parent: Element, depth: number): string {
  let value = "";
  for (const node of Array.from(parent.childNodes)) {
    if (node.nodeType === TEXT_NODE || node.nodeType === CDATA_SECTION_NODE) {
      value += node.nodeValue ?? "";
    } else if (isElement(node)) {
      value += elementMarkup(node, depth + 1);
    }
  }
  return value;
}

function elementMarkup(element: Element, depth: number): string {
  if (depth > MAX_DEPTH) {
    throw new AdapterError("MAX_DEPTH_EXCEEDED", "The file nests inline elements too deeply.");
  }
  const name = elementName(element);
  const open = `<${name}${attributeMarkup(element)}`;
  if (element.childNodes.length === 0) {
    return `${open}/>`;
  }
  return `${open}>${childrenValue(element, depth)}</${name}>`;
}

export function readInlineValue(element: Element): string {
  return childrenValue(element, 0);
}

function isAllowedInlineElement(element: Element, version: XliffVersion): boolean {
  const namespace = element.namespaceURI;
  const hasAllowedNamespace = namespace === null || XLIFF_NAMESPACES.has(namespace);
  return hasAllowedNamespace && INLINE_ELEMENTS[version].has(element.localName ?? "");
}

function isAllowedFragmentNode(node: Node, version: XliffVersion): boolean {
  if (node.nodeType === TEXT_NODE) {
    return true;
  }
  return isElement(node) && isAllowedInlineElement(node, version);
}

function allDescendantNodes(node: Node): Node[] {
  const result: Node[] = [];
  const stack: Array<{ node: Node; depth: number }> = [{ node, depth: 1 }];
  while (stack.length > 0) {
    const top = stack.pop();
    if (top === undefined) {
      break;
    }
    if (top.depth > MAX_DEPTH) {
      throw new AdapterError(
        "MAX_DEPTH_EXCEEDED",
        "The translated value nests inline elements too deeply.",
      );
    }
    for (const child of Array.from(top.node.childNodes)) {
      result.push(child);
      stack.push({ node: child, depth: top.depth + 1 });
    }
  }
  return result;
}

function hasDisallowedNode(root: Element, version: XliffVersion): boolean {
  return allDescendantNodes(root).some((node) => !isAllowedFragmentNode(node, version));
}

function attributeNames(element: Element): string[] {
  const names: string[] = [];
  for (let i = 0; i < element.attributes.length; i += 1) {
    const attr = element.attributes.item(i);
    if (attr !== null) {
      names.push(attr.name);
    }
  }
  return names;
}

function sanitizeInlineAttributes(root: Element): void {
  for (const el of Array.from(root.getElementsByTagName("*"))) {
    const allowed = INLINE_ELEMENT_ATTRIBUTES[el.localName ?? ""] ?? [];
    for (const name of attributeNames(el)) {
      if (!allowed.includes(name)) {
        el.removeAttribute(name);
      }
    }
  }
}

export function assertNoDoctype(content: string): void {
  if (/<!DOCTYPE/i.test(content) || /<!ENTITY/i.test(content)) {
    throw new AdapterError("INVALID_XML", "XLIFF with a DTD or entity declaration is rejected.");
  }
}

function fragmentMarkup(value: string, version: XliffVersion): string {
  let markup = "";
  let last = 0;
  for (const match of value.matchAll(INLINE_TAG)) {
    const name = match[1] ?? "";
    if (INLINE_ELEMENTS[version].has(name)) {
      markup += escapeText(value.slice(last, match.index)) + match[0];
      last = match.index + match[0].length;
    }
  }
  return markup + escapeText(value.slice(last));
}

function onFatal(level: "warning" | "error" | "fatalError"): void {
  if (level === "fatalError") {
    throw new Error("malformed XML");
  }
}

function namespaceDeclaration(namespace: string | null): string {
  return namespace === null ? "" : ` xmlns="${escapeAttribute(namespace)}"`;
}

function fragmentNodes(value: string, namespace: string | null, version: XliffVersion): Node[] {
  const parser = new DOMParser({ onError: onFatal });
  const markup = fragmentMarkup(value, version);
  let root: Element | null;
  try {
    root = parser.parseFromString(
      `<wrapper${namespaceDeclaration(namespace)}>${markup}</wrapper>`,
      "text/xml",
    ).documentElement;
  } catch {
    return [];
  }
  if (root === null || hasDisallowedNode(root, version)) {
    return [];
  }
  sanitizeInlineAttributes(root);
  return Array.from(root.childNodes);
}

export function writeInlineValue(
  doc: Document,
  element: Element,
  value: string,
  version: XliffVersion,
): void {
  assertNoDoctype(value);
  while (element.firstChild !== null) {
    element.removeChild(element.firstChild);
  }
  const nodes = fragmentNodes(value, element.namespaceURI, version);
  if (nodes.length === 0) {
    element.appendChild(doc.createTextNode(value));
    return;
  }
  for (const node of nodes) {
    element.appendChild(doc.importNode(node, true));
  }
}
