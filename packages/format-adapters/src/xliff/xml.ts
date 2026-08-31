import type { TranslationEntry } from "@verbatra/core";
import { DOMParser, type Document, type Element, type Node, XMLSerializer } from "@xmldom/xmldom";
import { AdapterError } from "../errors.js";
import type { AdapterFs, BoundedReadOutcome } from "../fs-port.js";
import { outcomeToContent, readBoundedFile } from "../json/bounded-read.js";
import { isEnoent } from "../shell.js";
import { extractXliffPlaceholders } from "./placeholders.js";

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;

interface Unit {
  readonly key: string;
  readonly source: Element;
  readonly target: Element | null;
  readonly container: Element;
  readonly description?: string;
}

function isElement(node: Node): node is Element {
  return node.nodeType === ELEMENT_NODE;
}

function elementChildren(parent: Element): Element[] {
  return Array.from(parent.childNodes).filter(isElement);
}

function childByName(parent: Element, name: string): Element | null {
  return elementChildren(parent).find((el) => el.localName === name) ?? null;
}

function collectByTag(root: Element, name: string): Element[] {
  return Array.from(root.getElementsByTagName(name));
}

function unitKey(element: Element, index: number): string {
  return element.getAttribute("id") ?? element.getAttribute("resname") ?? `unit-${index}`;
}

function onFatal(level: "warning" | "error" | "fatalError"): void {
  if (level === "fatalError") {
    throw new Error("malformed XML");
  }
}

function assertNoDoctype(content: string): void {
  if (/<!DOCTYPE/i.test(content) || /<!ENTITY/i.test(content)) {
    throw new AdapterError("INVALID_XML", "XLIFF with a DTD or entity declaration is rejected.");
  }
}

function parseXml(content: string): { doc: Document; root: Element } {
  assertNoDoctype(content);
  let doc: Document;
  try {
    doc = new DOMParser({ onError: onFatal }).parseFromString(content, "text/xml");
  } catch {
    throw new AdapterError("INVALID_XML", "The file is not valid XML.");
  }
  const root = doc.documentElement;
  if (root === null || root.localName !== "xliff") {
    throw new AdapterError("INVALID_STRUCTURE", "The file is not an XLIFF document.");
  }
  return { doc, root };
}

function firstNoteText(parent: Element): string | undefined {
  const note = childByName(parent, "note");
  if (note === null) {
    return undefined;
  }
  const text = (note.textContent ?? "").trim();
  return text === "" ? undefined : text;
}

function transUnitDescription(tu: Element): string | undefined {
  return firstNoteText(tu);
}

function unitDescription(unit: Element): string | undefined {
  const notes = childByName(unit, "notes");
  return notes === null ? undefined : firstNoteText(notes);
}

function walkXliff12(root: Element): Unit[] {
  const units: Unit[] = [];
  collectByTag(root, "trans-unit").forEach((tu, index) => {
    const source = childByName(tu, "source");
    if (source !== null) {
      const description = transUnitDescription(tu);
      units.push({
        key: unitKey(tu, index),
        source,
        target: childByName(tu, "target"),
        container: tu,
        ...(description !== undefined ? { description } : {}),
      });
    }
  });
  return units;
}

function walkXliff20(root: Element): Unit[] {
  const units: Unit[] = [];
  collectByTag(root, "unit").forEach((unit, index) => {
    const baseKey = unitKey(unit, index);
    const description = unitDescription(unit);
    const segments = elementChildren(unit).filter((el) => el.localName === "segment");
    segments.forEach((segment, segIndex) => {
      const source = childByName(segment, "source");
      if (source !== null) {
        const key = segments.length > 1 ? `${baseKey}#${segIndex}` : baseKey;
        units.push({
          key,
          source,
          target: childByName(segment, "target"),
          container: segment,
          ...(description !== undefined ? { description } : {}),
        });
      }
    });
  });
  return units;
}

function walkUnits(root: Element): Unit[] {
  const version = root.getAttribute("version") ?? "1.2";
  return version.startsWith("2") ? walkXliff20(root) : walkXliff12(root);
}

function innerXml(serializer: XMLSerializer, element: Element): string {
  return Array.from(element.childNodes)
    .map((node) => serializer.serializeToString(node))
    .join("");
}

function unitValue(serializer: XMLSerializer, unit: Unit): string {
  if (unit.target !== null) {
    const targetXml = innerXml(serializer, unit.target);
    if (targetXml.trim() !== "") {
      return targetXml;
    }
  }
  return innerXml(serializer, unit.source);
}

export function parseXliffEntries(
  content: string,
  namespace: string,
): Map<string, TranslationEntry> {
  const { root } = parseXml(content);
  const serializer = new XMLSerializer();
  const out = new Map<string, TranslationEntry>();
  for (const unit of walkUnits(root)) {
    if (out.has(unit.key)) {
      throw new AdapterError(
        "INVALID_STRUCTURE",
        "The XLIFF file has two trans-units with the same id.",
      );
    }
    const value = unitValue(serializer, unit);
    out.set(unit.key, {
      key: unit.key,
      namespace,
      value,
      placeholders: extractXliffPlaceholders(value),
      isPlural: false,
      ...(unit.description !== undefined ? { description: unit.description } : {}),
    });
  }
  return out;
}

function destinationReadErrorMessage(error: unknown): string {
  if (isEnoent(error)) {
    return "The destination XLIFF file does not exist.";
  }
  const reason = error instanceof Error ? error.message : String(error);
  return `The destination XLIFF file could not be read: ${reason}`;
}

async function readDestination(filePath: string, fs: AdapterFs): Promise<string> {
  let outcome: BoundedReadOutcome;
  try {
    outcome = await readBoundedFile(fs, filePath);
  } catch (error) {
    throw new AdapterError("INVALID_STRUCTURE", destinationReadErrorMessage(error));
  }
  return outcomeToContent(outcome, "The destination path is not a regular file.");
}

const XLIFF_INLINE_ELEMENTS = new Set(["x", "g", "bx", "ex", "ph", "it", "mrk"]);

const XLIFF_NAMESPACES = new Set([
  "urn:oasis:names:tc:xliff:document:1.2",
  "urn:oasis:names:tc:xliff:document:2.0",
]);

const INLINE_ELEMENT_ATTRIBUTES: Readonly<Record<string, readonly string[]>> = {
  x: ["id", "ctype"],
  ph: ["id", "ctype"],
  g: ["id", "ctype"],
  bx: ["id", "rid", "ctype"],
  ex: ["id", "rid"],
  it: ["id", "pos", "ctype"],
  mrk: ["id", "mtype"],
};

function isAllowedInlineElement(element: Element): boolean {
  const namespace = element.namespaceURI;
  const hasAllowedNamespace = namespace === null || XLIFF_NAMESPACES.has(namespace);
  return hasAllowedNamespace && XLIFF_INLINE_ELEMENTS.has(element.localName ?? "");
}

function isAllowedFragmentNode(node: Node): boolean {
  if (node.nodeType === TEXT_NODE) {
    return true;
  }
  return isElement(node) && isAllowedInlineElement(node);
}

function allDescendantNodes(node: Node): Node[] {
  const children = Array.from(node.childNodes);
  return children.flatMap((child) => [child, ...allDescendantNodes(child)]);
}

function hasDisallowedNode(root: Element): boolean {
  return allDescendantNodes(root).some((node) => !isAllowedFragmentNode(node));
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
  for (const el of collectByTag(root, "*")) {
    const allowed = INLINE_ELEMENT_ATTRIBUTES[el.localName ?? ""] ?? [];
    for (const name of attributeNames(el)) {
      if (!allowed.includes(name)) {
        el.removeAttribute(name);
      }
    }
  }
}

function fragmentNodes(parser: DOMParser, value: string): Node[] | null {
  assertNoDoctype(value);
  try {
    const root = parser.parseFromString(`<wrapper>${value}</wrapper>`, "text/xml").documentElement;
    if (root === null || hasDisallowedNode(root)) {
      return null;
    }
    sanitizeInlineAttributes(root);
    return Array.from(root.childNodes);
  } catch {
    return null;
  }
}

function setTargetValue(doc: Document, parser: DOMParser, element: Element, value: string): void {
  while (element.firstChild !== null) {
    element.removeChild(element.firstChild);
  }
  const nodes = fragmentNodes(parser, value);
  if (nodes === null) {
    element.textContent = value;
    return;
  }
  for (const node of nodes) {
    element.appendChild(doc.importNode(node, true));
  }
}

export async function serializeXliffEntries(
  entries: ReadonlyMap<string, TranslationEntry>,
  filePath: string,
  fs: AdapterFs,
): Promise<string> {
  const { doc, root } = parseXml(await readDestination(filePath, fs));
  const parser = new DOMParser({ onError: onFatal });
  for (const unit of walkUnits(root)) {
    const entry = entries.get(unit.key);
    if (entry !== undefined) {
      const target = unit.target ?? doc.createElement("target");
      if (unit.target === null) {
        unit.container.appendChild(target);
      }
      setTargetValue(doc, parser, target, entry.value);
    }
  }
  return new XMLSerializer().serializeToString(doc);
}
