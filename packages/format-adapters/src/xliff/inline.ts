import { DOMParser, type Document, type Element, type Node } from "@xmldom/xmldom";
import { AdapterError } from "../errors.js";
import { MAX_DEPTH } from "../json/limits.js";
import { isElement, onFatal, TEXT_NODE } from "../xml/document.js";
import type { XliffVersion } from "./document.js";

const CDATA_SECTION_NODE = 4;

const XLIFF_NAMESPACES = new Set([
  "urn:oasis:names:tc:xliff:document:1.2",
  "urn:oasis:names:tc:xliff:document:2.0",
]);

type AttributeTable = Readonly<Record<string, readonly string[]>>;

const XLIFF_12_GENERIC_ATTRIBUTES = ["id", "ctype", "ts", "clone", "xid", "equiv-text"] as const;

const XLIFF_20_CODE_ATTRIBUTES = [
  "id",
  "canCopy",
  "canDelete",
  "canReorder",
  "copyOf",
  "dataRef",
  "disp",
  "equiv",
  "subFlows",
  "subType",
  "type",
] as const;

const XLIFF_20_SPAN_CODE_ATTRIBUTES = [
  ...XLIFF_20_CODE_ATTRIBUTES,
  "canOverlap",
  "dir",
  "isolated",
] as const;

const XLIFF_20_MARKER_ATTRIBUTES = ["id", "translate", "type", "ref", "value"] as const;

const INLINE_ELEMENT_ATTRIBUTES: Readonly<Record<XliffVersion, AttributeTable>> = {
  "1.2": {
    g: XLIFF_12_GENERIC_ATTRIBUTES,
    x: XLIFF_12_GENERIC_ATTRIBUTES,
    bx: ["id", "rid", "ctype", "ts", "clone", "xid", "equiv-text"],
    ex: ["id", "rid", "ts", "xid", "equiv-text"],
    bpt: ["id", "rid", "ctype", "ts", "crc", "xid", "equiv-text"],
    ept: ["id", "rid", "ts", "crc", "xid", "equiv-text"],
    ph: ["id", "ctype", "ts", "crc", "assoc", "xid", "equiv-text"],
    it: ["id", "pos", "rid", "ctype", "ts", "crc", "xid", "equiv-text"],
    mrk: ["mtype", "mid", "ts", "comment"],
  },
  "2.0": {
    ph: XLIFF_20_CODE_ATTRIBUTES,
    pc: [
      "id",
      "canCopy",
      "canDelete",
      "canOverlap",
      "canReorder",
      "copyOf",
      "dataRefEnd",
      "dataRefStart",
      "dir",
      "dispEnd",
      "dispStart",
      "equivEnd",
      "equivStart",
      "subFlowsEnd",
      "subFlowsStart",
      "subType",
      "type",
    ],
    sc: XLIFF_20_SPAN_CODE_ATTRIBUTES,
    ec: [...XLIFF_20_SPAN_CODE_ATTRIBUTES, "startRef"],
    mrk: XLIFF_20_MARKER_ATTRIBUTES,
    sm: XLIFF_20_MARKER_ATTRIBUTES,
    em: ["startRef"],
    cp: ["hex"],
  },
};

export const INLINE_ELEMENT_NAMES: Readonly<Record<XliffVersion, ReadonlySet<string>>> = {
  "1.2": new Set(Object.keys(INLINE_ELEMENT_ATTRIBUTES["1.2"])),
  "2.0": new Set(Object.keys(INLINE_ELEMENT_ATTRIBUTES["2.0"])),
};

const SUB_FLOW = "sub";
const SUB_FLOW_ATTRIBUTES = ["datatype", "ctype", "xid"] as const;
const SUB_FLOW_PARENTS = new Set(["bpt", "ept", "ph", "it"]);
const XLIFF_12_NAMES_WITH_SUB_FLOWS = new Set([...INLINE_ELEMENT_NAMES["1.2"], SUB_FLOW]);

const INLINE_TAG = /<\/?([A-Za-z][\w.-]*)(?:\s[^<>]*)?\/?>/g;

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

function localNameOf(element: Element): string {
  return element.localName ?? "";
}

function hasXliffNamespace(element: Element): boolean {
  const namespace = element.namespaceURI;
  return namespace === null || XLIFF_NAMESPACES.has(namespace);
}

function isSubFlow(element: Element, version: XliffVersion): boolean {
  const parent = element.parentNode;
  return (
    version === "1.2" &&
    localNameOf(element) === SUB_FLOW &&
    parent !== null &&
    isElement(parent) &&
    SUB_FLOW_PARENTS.has(localNameOf(parent))
  );
}

function allowedAttributes(element: Element, version: XliffVersion): readonly string[] {
  return INLINE_ELEMENT_ATTRIBUTES[version][localNameOf(element)] ?? SUB_FLOW_ATTRIBUTES;
}

function isAllowedFragmentNode(node: Node, version: XliffVersion): boolean {
  if (node.nodeType === TEXT_NODE) {
    return true;
  }
  if (!isElement(node) || !hasXliffNamespace(node)) {
    return false;
  }
  return INLINE_ELEMENT_NAMES[version].has(localNameOf(node)) || isSubFlow(node, version);
}

function subtree(node: Node): Node[] {
  const result: Node[] = [];
  const stack: Array<{ node: Node; depth: number }> = [{ node, depth: 2 }];
  for (let top = stack.pop(); top !== undefined; top = stack.pop()) {
    if (top.depth > MAX_DEPTH) {
      throw new AdapterError(
        "MAX_DEPTH_EXCEEDED",
        "The translated value nests inline elements too deeply.",
      );
    }
    result.push(top.node);
    for (const child of Array.from(top.node.childNodes)) {
      stack.push({ node: child, depth: top.depth + 1 });
    }
  }
  return result;
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

function sanitizeInlineAttributes(element: Element, version: XliffVersion): void {
  const allowed = allowedAttributes(element, version);
  for (const name of attributeNames(element)) {
    if (!allowed.includes(name)) {
      element.removeAttribute(name);
    }
  }
}

function fragmentMarkup(value: string, liveNames: ReadonlySet<string>): string {
  let markup = "";
  let last = 0;
  for (const match of value.matchAll(INLINE_TAG)) {
    if (liveNames.has(match[1] ?? "")) {
      markup += escapeText(value.slice(last, match.index)) + match[0];
      last = match.index + match[0].length;
    }
  }
  return markup + escapeText(value.slice(last));
}

function namespaceDeclaration(namespace: string | null): string {
  return namespace === null ? "" : ` xmlns="${escapeAttribute(namespace)}"`;
}

function parseFragment(
  value: string,
  namespace: string | null,
  version: XliffVersion,
  liveNames: ReadonlySet<string>,
): Node[] | null {
  let doc: Document;
  try {
    doc = new DOMParser({ onError: onFatal }).parseFromString(
      `<wrapper${namespaceDeclaration(namespace)}>${fragmentMarkup(value, liveNames)}</wrapper>`,
      "text/xml",
    );
  } catch {
    return null;
  }
  const nodes = Array.from(doc.childNodes).flatMap((wrapper) => Array.from(wrapper.childNodes));
  const all = nodes.flatMap(subtree);
  if (!all.every((node) => isAllowedFragmentNode(node, version))) {
    return null;
  }
  for (const element of all.filter(isElement)) {
    sanitizeInlineAttributes(element, version);
  }
  return nodes;
}

function liveNameAttempts(version: XliffVersion): readonly ReadonlySet<string>[] {
  return version === "1.2"
    ? [XLIFF_12_NAMES_WITH_SUB_FLOWS, INLINE_ELEMENT_NAMES["1.2"]]
    : [INLINE_ELEMENT_NAMES["2.0"]];
}

function fragmentNodes(value: string, namespace: string | null, version: XliffVersion): Node[] {
  for (const liveNames of liveNameAttempts(version)) {
    const nodes = parseFragment(value, namespace, version, liveNames);
    if (nodes !== null) {
      return nodes;
    }
  }
  return [];
}

export function writeInlineValue(
  doc: Document,
  element: Element,
  value: string,
  version: XliffVersion,
): void {
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
