import { DOMParser, type Document, type Element, type Node } from "@xmldom/xmldom";
import { AdapterError } from "../errors.js";
import { type DeclaredLanguages, xliff12Languages, xliff20Languages } from "./languages.js";

export type XliffVersion = "1.2" | "2.0";

export const ELEMENT_NODE = 1;
export const TEXT_NODE = 3;

export interface Unit {
  readonly key: string;
  readonly source: Element;
  readonly target: Element | null;
  readonly container: Element;
  readonly owner: Element;
  readonly languages: DeclaredLanguages;
  readonly scope: Element;
  readonly description?: string;
}

export function isElement(node: Node): node is Element {
  return node.nodeType === ELEMENT_NODE;
}

export function elementChildren(parent: Element): Element[] {
  return Array.from(parent.childNodes).filter(isElement);
}

export function childByName(parent: Element, name: string): Element | null {
  return elementChildren(parent).find((el) => el.localName === name) ?? null;
}

export function collectByTag(root: Element, name: string): Element[] {
  return Array.from(root.getElementsByTagName(name));
}

function unitKey(element: Element, index: number): string {
  return element.getAttribute("id") ?? element.getAttribute("resname") ?? `unit-${index}`;
}

export function onFatal(level: "warning" | "error" | "fatalError"): void {
  if (level === "fatalError") {
    throw new Error("malformed XML");
  }
}

function assertNoDoctype(content: string): void {
  if (/<!DOCTYPE/i.test(content) || /<!ENTITY/i.test(content)) {
    throw new AdapterError("INVALID_XML", "XLIFF with a DTD or entity declaration is rejected.");
  }
}

export function parseXml(content: string): { doc: Document; root: Element } {
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
  let index = 0;
  for (const file of collectByTag(root, "file")) {
    const languages = xliff12Languages(file);
    for (const tu of collectByTag(file, "trans-unit")) {
      const source = childByName(tu, "source");
      if (source !== null) {
        const description = transUnitDescription(tu);
        units.push({
          key: unitKey(tu, index),
          source,
          target: childByName(tu, "target"),
          container: tu,
          owner: tu,
          languages,
          scope: file,
          ...(description !== undefined ? { description } : {}),
        });
      }
      index += 1;
    }
  }
  return units;
}

function walkXliff20(root: Element): Unit[] {
  const units: Unit[] = [];
  const languages = xliff20Languages(root);
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
          owner: unit,
          languages,
          scope: root,
          ...(description !== undefined ? { description } : {}),
        });
      }
    });
  });
  return units;
}

export function documentVersion(root: Element): XliffVersion {
  return (root.getAttribute("version") ?? "1.2").startsWith("2") ? "2.0" : "1.2";
}

export function walkUnits(root: Element): Unit[] {
  return documentVersion(root) === "2.0" ? walkXliff20(root) : walkXliff12(root);
}
