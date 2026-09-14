import type { TranslationEntry } from "@verbatra/core";
import { type Document, type Element, type Node, XMLSerializer } from "@xmldom/xmldom";
import { AdapterError } from "../errors.js";
import type { AdapterFs } from "../fs-port.js";
import { detectLineTerminator } from "../shell.js";
import {
  applyLineTerminator,
  elementChildren,
  readXmlDestination,
  setSingleTextValue,
  singleTextValue,
  TEXT_NODE,
  XML_PROLOG,
} from "../xml/document.js";
import { extractResxPlaceholders } from "./placeholders.js";
import { createResxDocument, parseResxXml } from "./xml.js";

const TRAILING_NEWLINES = /(?:\r\n|\r|\n)+$/;
const DESIGNER_NAME = /^(?:>>|\$)/;

function isTranslatableData(element: Element, name: string): boolean {
  return (
    name !== "" &&
    !DESIGNER_NAME.test(name) &&
    !element.hasAttribute("type") &&
    !element.hasAttribute("mimetype")
  );
}

function dataName(element: Element): string {
  return element.getAttribute("name") ?? "";
}

function valueElement(element: Element): Element | undefined {
  return elementChildren(element, "value")[0];
}

function plainText(element: Element): string | undefined {
  const value = valueElement(element);
  return value === undefined ? undefined : singleTextValue(value);
}

function commentText(element: Element): string | undefined {
  const comment = elementChildren(element, "comment")[0];
  if (comment === undefined) {
    return undefined;
  }
  const text = (singleTextValue(comment) ?? "").trim();
  return text === "" ? undefined : text;
}

function toEntry(element: Element, name: string, namespace: string): TranslationEntry | undefined {
  const value = plainText(element);
  if (value === undefined) {
    return undefined;
  }
  const description = commentText(element);
  return {
    key: name,
    namespace,
    value,
    placeholders: extractResxPlaceholders(value),
    isPlural: false,
    ...(description !== undefined ? { description } : {}),
  };
}

export function parseResxEntries(
  content: string,
  namespace: string,
): Map<string, TranslationEntry> {
  const { root } = parseResxXml(content);
  const map = new Map<string, TranslationEntry>();
  for (const element of elementChildren(root, "data")) {
    const name = dataName(element);
    if (!isTranslatableData(element, name)) {
      continue;
    }
    const entry = toEntry(element, name, namespace);
    if (entry !== undefined) {
      map.set(name, entry);
    }
  }
  return map;
}

function writeValue(doc: Document, element: Element, value: string): void {
  const existing = valueElement(element);
  if (existing !== undefined) {
    setSingleTextValue(doc, existing, value);
    return;
  }
  const created = doc.createElement("value");
  created.appendChild(doc.createTextNode(value));
  element.appendChild(created);
}

function closingIndent(root: Element): Node | null {
  const last = root.lastChild;
  if (last === null || last.nodeType !== TEXT_NODE) {
    return null;
  }
  return (last.nodeValue ?? "").trim() === "" ? last : null;
}

function appendData(doc: Document, root: Element, name: string, value: string): void {
  const element = doc.createElement("data");
  element.setAttribute("name", name);
  element.setAttribute("xml:space", "preserve");
  writeValue(doc, element, value);
  const anchor = closingIndent(root);
  root.insertBefore(doc.createTextNode("\n  "), anchor);
  root.insertBefore(element, anchor);
}

function patchData(
  doc: Document,
  element: Element,
  entries: ReadonlyMap<string, TranslationEntry>,
  claimed: Set<string>,
): void {
  const name = dataName(element);
  claimed.add(name);
  if (!isTranslatableData(element, name)) {
    return;
  }
  const value = valueElement(element);
  if (value !== undefined && singleTextValue(value) === undefined) {
    return;
  }
  const entry = entries.get(name);
  if (entry !== undefined) {
    writeValue(doc, element, entry.value);
    return;
  }
  if (value !== undefined) {
    element.parentNode?.removeChild(element);
  }
}

function appendUnmatched(
  doc: Document,
  root: Element,
  entries: ReadonlyMap<string, TranslationEntry>,
  claimed: ReadonlySet<string>,
): void {
  for (const [name, entry] of entries) {
    if (!claimed.has(name)) {
      appendData(doc, root, name, entry.value);
    }
  }
}

function withTrailingNewlines(original: string, output: string): string {
  const match = TRAILING_NEWLINES.exec(original);
  return match === null ? output : `${output}${match[0]}`;
}

function synthesize(entries: ReadonlyMap<string, TranslationEntry>): string {
  const { doc, root } = createResxDocument();
  appendUnmatched(doc, root, entries, new Set());
  root.appendChild(doc.createTextNode("\n"));
  return `${XML_PROLOG}${new XMLSerializer().serializeToString(doc)}\n`;
}

export async function serializeResxEntries(
  entries: ReadonlyMap<string, TranslationEntry>,
  filePath: string,
  fs: AdapterFs,
): Promise<string> {
  const existing = await readXmlDestination(filePath, fs);
  if (existing === undefined) {
    return synthesize(entries);
  }
  const { doc, root } = parseResxXml(existing);
  const claimed = new Set<string>();
  for (const element of elementChildren(root, "data")) {
    patchData(doc, element, entries, claimed);
  }
  appendUnmatched(doc, root, entries, claimed);
  return withTrailingNewlines(existing, new XMLSerializer().serializeToString(doc));
}
