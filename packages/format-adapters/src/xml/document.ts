import {
  DOMImplementation,
  DOMParser,
  type Document,
  type Element,
  type Node,
  XMLSerializer,
} from "@xmldom/xmldom";
import { AdapterError } from "../errors.js";
import type { AdapterFs } from "../fs-port.js";
import { outcomeToContent, readBoundedFile } from "../json/bounded-read.js";
import {
  detectLineTerminator,
  isEnoent,
  type LineTerminator,
  trailingLineBreaks,
} from "../shell.js";

const ELEMENT_NODE = 1;
export const TEXT_NODE = 3;

export const XML_PROLOG = '<?xml version="1.0" encoding="utf-8"?>\n';

export interface XmlDocumentLabels {
  readonly doctype: string;
  readonly notXml: string;
  readonly notRoot: string;
}

export function onFatal(level: "warning" | "error" | "fatalError", message: string): void {
  if (level === "fatalError") {
    throw new Error(message);
  }
}

function assertNoDoctype(content: string, message: string): void {
  if (/<!DOCTYPE/i.test(content) || /<!ENTITY/i.test(content)) {
    throw new AdapterError("INVALID_XML", message);
  }
}

function parseErrorDetail(error: unknown): string {
  return error instanceof Error && error.message.length > 0 ? `: ${error.message}` : "";
}

export function parseXmlDocument(
  content: string,
  rootTag: string,
  labels: XmlDocumentLabels,
): { doc: Document; root: Element } {
  assertNoDoctype(content, labels.doctype);
  let doc: Document;
  try {
    doc = new DOMParser({ onError: onFatal }).parseFromString(content, "text/xml");
  } catch (error) {
    throw new AdapterError("INVALID_XML", `${labels.notXml}${parseErrorDetail(error)}.`);
  }
  const root = doc.documentElement;
  if (root === null || root.localName !== rootTag) {
    throw new AdapterError("INVALID_STRUCTURE", labels.notRoot);
  }
  return { doc, root };
}

export function createXmlDocument(
  rootTag: string,
  failureMessage: string,
): { doc: Document; root: Element } {
  const doc = new DOMImplementation().createDocument(null, rootTag, null);
  const root = doc.documentElement;
  if (root === null) {
    throw new AdapterError("INVALID_STRUCTURE", failureMessage);
  }
  return { doc, root };
}

export function isElement(node: { readonly nodeType: number }): node is Element {
  return node.nodeType === ELEMENT_NODE;
}

export function elementChildren(parent: Element, tag?: string): Element[] {
  const children = Array.from(parent.childNodes).filter(isElement);
  return tag === undefined ? children : children.filter((el) => el.localName === tag);
}

export function singleTextValue(element: Element): string | undefined {
  const children = element.childNodes;
  if (children.length === 0) {
    return "";
  }
  if (children.length === 1) {
    const only = children.item(0);
    if (only !== null && only.nodeType === TEXT_NODE) {
      return only.nodeValue ?? "";
    }
  }
  return undefined;
}

export function setSingleTextValue(doc: Document, element: Element, value: string): void {
  while (element.firstChild !== null) {
    element.removeChild(element.firstChild);
  }
  element.appendChild(doc.createTextNode(value));
}

export async function readXmlDestination(
  filePath: string,
  fs: AdapterFs,
): Promise<string | undefined> {
  try {
    const outcome = await readBoundedFile(fs, filePath);
    return outcomeToContent(outcome, "The destination path is not a regular file.");
  } catch (error) {
    if (isEnoent(error)) {
      return undefined;
    }
    if (error instanceof AdapterError) {
      throw error;
    }
    throw new AdapterError("INVALID_STRUCTURE", "The destination file could not be read.");
  }
}

const ANY_LINE_TERMINATOR = /\r\n?/g;

export function applyLineTerminator(output: string, terminator: LineTerminator): string {
  const normalized = output.replace(ANY_LINE_TERMINATOR, "\n");
  return terminator === "\n" ? normalized : normalized.replaceAll("\n", terminator);
}

export function serializeXmlInto(original: string, doc: Document): string {
  const terminator = detectLineTerminator(original);
  const body = applyLineTerminator(new XMLSerializer().serializeToString(doc), terminator);
  return `${body}${applyLineTerminator(trailingLineBreaks(original), terminator)}`;
}

export function isWhitespaceText(node: Node | null): boolean {
  return node !== null && node.nodeType === TEXT_NODE && (node.nodeValue ?? "").trim() === "";
}

export function childIndent(container: Element, fallback: string): string {
  const indent = elementChildren(container).at(-1)?.previousSibling ?? null;
  return isWhitespaceText(indent) ? (indent?.nodeValue ?? fallback) : fallback;
}

export function appendIndented(
  doc: Document,
  container: Element,
  node: Element,
  empty?: { readonly indent: string; readonly closing: string },
): void {
  const trailing = isWhitespaceText(container.lastChild) ? container.lastChild : null;
  const lastElement = elementChildren(container).at(-1);
  const indent = lastElement?.previousSibling ?? null;
  if (isWhitespaceText(indent)) {
    container.insertBefore(doc.createTextNode(indent?.nodeValue ?? ""), trailing);
  } else if (lastElement === undefined && empty !== undefined) {
    container.insertBefore(doc.createTextNode(empty.indent), trailing);
    container.insertBefore(node, trailing);
    if (trailing === null) {
      container.appendChild(doc.createTextNode(empty.closing));
    }
    return;
  }
  container.insertBefore(node, trailing);
}

export function insertIndentedAfter(
  doc: Document,
  parent: Element,
  anchor: Element,
  node: Element,
): void {
  const indent = anchor.previousSibling;
  const next = anchor.nextSibling;
  if (isWhitespaceText(indent)) {
    parent.insertBefore(doc.createTextNode(indent?.nodeValue ?? ""), next);
  }
  parent.insertBefore(node, next);
}

export function removeIndented(parent: Element, element: Element): void {
  const indent = element.previousSibling;
  if (indent !== null && isWhitespaceText(indent)) {
    parent.removeChild(indent);
  }
  parent.removeChild(element);
}
