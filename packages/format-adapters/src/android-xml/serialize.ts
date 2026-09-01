import type { TranslationEntry } from "@verbatra/core";
import { type Document, type Element, XMLSerializer } from "@xmldom/xmldom";
import type { AdapterFs } from "../fs-port.js";
import { outcomeToContent, readBoundedFile } from "../json/bounded-read.js";
import { isEnoent } from "../shell.js";
import { encodeAndroidEscapes } from "./escape.js";
import { assertValidResourceName } from "./names.js";
import {
  ANDROID_PLURAL_CATEGORIES,
  androidPluralBaseKey,
  androidPluralCategoryOf,
} from "./plural.js";
import {
  createAndroidXmlDocument,
  elementChildren,
  parseAndroidXml,
  setSingleTextValue,
  singleTextValue,
} from "./xml.js";

const XML_PROLOG = '<?xml version="1.0" encoding="utf-8"?>\n';

interface Grouped {
  readonly singular: ReadonlyMap<string, TranslationEntry>;
  readonly plural: ReadonlyMap<string, ReadonlyMap<string, TranslationEntry>>;
}

function groupEntries(entries: ReadonlyMap<string, TranslationEntry>): Grouped {
  const singular = new Map<string, TranslationEntry>();
  const plural = new Map<string, Map<string, TranslationEntry>>();
  for (const [key, entry] of entries) {
    const baseKey = androidPluralBaseKey(key);
    const category = androidPluralCategoryOf(key);
    if (baseKey !== undefined && category !== undefined) {
      const group = plural.get(baseKey) ?? new Map<string, TranslationEntry>();
      group.set(category, entry);
      plural.set(baseKey, group);
    } else {
      singular.set(key, entry);
    }
  }
  return { singular, plural };
}

function isTranslatable(element: Element): boolean {
  return element.getAttribute("translatable") !== "false";
}

function appendStringElement(doc: Document, root: Element, name: string, value: string): void {
  const element = doc.createElement("string");
  element.setAttribute("name", name);
  element.appendChild(doc.createTextNode(encodeAndroidEscapes(value)));
  root.appendChild(element);
}

function appendPluralsElement(
  doc: Document,
  root: Element,
  name: string,
  categories: ReadonlyMap<string, TranslationEntry>,
): void {
  const plurals = doc.createElement("plurals");
  plurals.setAttribute("name", name);
  for (const category of ANDROID_PLURAL_CATEGORIES) {
    const entry = categories.get(category);
    if (entry === undefined) {
      continue;
    }
    const item = doc.createElement("item");
    item.setAttribute("quantity", category);
    item.appendChild(doc.createTextNode(encodeAndroidEscapes(entry.value)));
    plurals.appendChild(item);
  }
  root.appendChild(plurals);
}

function appendUnmatched(
  doc: Document,
  root: Element,
  grouped: Grouped,
  matched: ReadonlySet<string>,
): void {
  for (const [key, entry] of grouped.singular) {
    if (!matched.has(key)) {
      appendStringElement(doc, root, key, entry.value);
    }
  }
  for (const [baseKey, categories] of grouped.plural) {
    if (!matched.has(baseKey)) {
      appendPluralsElement(doc, root, baseKey, categories);
    }
  }
}

function isReadThroughString(element: Element): boolean {
  return !isTranslatable(element) || singleTextValue(element) === undefined;
}

function patchStringElement(
  doc: Document,
  element: Element,
  grouped: Grouped,
  matched: Set<string>,
): void {
  const name = element.getAttribute("name") ?? "";
  assertValidResourceName(name, "string");
  const entry = grouped.singular.get(name);
  if (entry !== undefined) {
    matched.add(name);
    element.removeAttribute("translatable");
    setSingleTextValue(doc, element, encodeAndroidEscapes(entry.value));
    return;
  }
  if (isReadThroughString(element)) {
    return;
  }
  matched.add(name);
  element.parentNode?.removeChild(element);
}

function isReadThroughPlurals(items: readonly Element[]): boolean {
  return items.some((item) => singleTextValue(item) === undefined);
}

function patchTranslatablePlurals(
  doc: Document,
  element: Element,
  items: readonly Element[],
  categories: ReadonlyMap<string, TranslationEntry>,
): void {
  const seen = new Set<string>();
  for (const item of items) {
    const quantity = item.getAttribute("quantity") ?? "";
    const entry = categories.get(quantity);
    if (entry === undefined) {
      element.removeChild(item);
      continue;
    }
    setSingleTextValue(doc, item, encodeAndroidEscapes(entry.value));
    seen.add(quantity);
  }
  for (const category of ANDROID_PLURAL_CATEGORIES) {
    const entry = categories.get(category);
    if (entry === undefined || seen.has(category)) {
      continue;
    }
    const item = doc.createElement("item");
    item.setAttribute("quantity", category);
    item.appendChild(doc.createTextNode(encodeAndroidEscapes(entry.value)));
    element.appendChild(item);
  }
}

function patchPluralsElement(
  doc: Document,
  element: Element,
  grouped: Grouped,
  matched: Set<string>,
): void {
  const name = element.getAttribute("name") ?? "";
  assertValidResourceName(name, "plurals");
  const items = elementChildren(element, "item");
  const categories = grouped.plural.get(name);
  if (categories !== undefined) {
    matched.add(name);
    element.removeAttribute("translatable");
    patchTranslatablePlurals(doc, element, items, categories);
    if (elementChildren(element, "item").length === 0) {
      element.parentNode?.removeChild(element);
    }
    return;
  }
  if (!isTranslatable(element) || isReadThroughPlurals(items)) {
    return;
  }
  matched.add(name);
  element.parentNode?.removeChild(element);
}

function patchDocument(doc: Document, root: Element, grouped: Grouped): void {
  const matched = new Set<string>();
  for (const element of elementChildren(root)) {
    if (element.localName === "string") {
      patchStringElement(doc, element, grouped, matched);
    } else if (element.localName === "plurals") {
      patchPluralsElement(doc, element, grouped, matched);
    }
  }
  appendUnmatched(doc, root, grouped, matched);
}

async function readDestination(filePath: string, fs: AdapterFs): Promise<string | undefined> {
  try {
    const outcome = await readBoundedFile(fs, filePath);
    return outcomeToContent(outcome, "The destination path is not a regular file.");
  } catch (error) {
    if (isEnoent(error)) {
      return undefined;
    }
    throw error;
  }
}

export async function serializeAndroidXmlEntries(
  entries: ReadonlyMap<string, TranslationEntry>,
  filePath: string,
  fs: AdapterFs,
): Promise<string> {
  const grouped = groupEntries(entries);
  const existing = await readDestination(filePath, fs);
  if (existing === undefined) {
    const { doc, root } = createAndroidXmlDocument();
    appendUnmatched(doc, root, grouped, new Set());
    return XML_PROLOG + new XMLSerializer().serializeToString(doc);
  }
  const { doc, root } = parseAndroidXml(existing);
  patchDocument(doc, root, grouped);
  return new XMLSerializer().serializeToString(doc);
}
