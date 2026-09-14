import { DOMImplementation, DOMParser, type Document, type Element } from "@xmldom/xmldom";
import { AdapterError } from "../errors.js";
import type { AdapterFs } from "../fs-port.js";
import { outcomeToContent, readBoundedFile } from "../json/bounded-read.js";
import { isEnoent, type LineTerminator } from "../shell.js";

export const ELEMENT_NODE = 1;
export const TEXT_NODE = 3;

export const XML_PROLOG = '<?xml version="1.0" encoding="utf-8"?>\n';

export interface XmlDocumentLabels {
  readonly doctype: string;
  readonly notXml: string;
  readonly notRoot: string;
}

function onFatal(level: "warning" | "error" | "fatalError", message: string): void {
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

export function applyLineTerminator(output: string, terminator: LineTerminator): string {
  return terminator === "\n" ? output : output.replaceAll("\n", terminator);
}
