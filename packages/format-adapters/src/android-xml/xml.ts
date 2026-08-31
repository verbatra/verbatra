import { DOMImplementation, DOMParser, type Document, type Element } from "@xmldom/xmldom";
import { AdapterError } from "../errors.js";

export const ELEMENT_NODE = 1;
export const TEXT_NODE = 3;

const ROOT_TAG = "resources";

function onFatal(level: "warning" | "error" | "fatalError", message: string): void {
  if (level === "fatalError") {
    throw new Error(message);
  }
}

function assertNoDoctype(content: string): void {
  if (/<!DOCTYPE/i.test(content) || /<!ENTITY/i.test(content)) {
    throw new AdapterError(
      "INVALID_XML",
      "strings.xml with a DTD or entity declaration is rejected.",
    );
  }
}

function parseErrorDetail(error: unknown): string {
  return error instanceof Error && error.message.length > 0 ? `: ${error.message}` : "";
}

export function parseAndroidXml(content: string): { doc: Document; root: Element } {
  assertNoDoctype(content);
  let doc: Document;
  try {
    doc = new DOMParser({ onError: onFatal }).parseFromString(content, "text/xml");
  } catch (error) {
    throw new AdapterError("INVALID_XML", `The file is not valid XML${parseErrorDetail(error)}.`);
  }
  const root = doc.documentElement;
  if (root === null || root.localName !== ROOT_TAG) {
    throw new AdapterError(
      "INVALID_STRUCTURE",
      `The file is not an Android resources file: the root element must be <${ROOT_TAG}>.`,
    );
  }
  return { doc, root };
}

export function createAndroidXmlDocument(): { doc: Document; root: Element } {
  const doc = new DOMImplementation().createDocument(null, ROOT_TAG, null);
  const root = doc.documentElement;
  if (root === null) {
    throw new AdapterError("INVALID_STRUCTURE", "Could not synthesize a new resources document.");
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
