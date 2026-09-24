import type { TranslationEntry } from "@verbatra/core";
import type { Document, Element, Node } from "@xmldom/xmldom";
import { AdapterError } from "../errors.js";
import { childByName, collectByTag, elementChildren, isElement, type Unit } from "./document.js";
import { writeInlineValue, type XliffVersion } from "./inline.js";

const TEXT_NODE = 3;

export interface AppendRequest {
  readonly doc: Document;
  readonly root: Element;
  readonly version: XliffVersion;
  readonly missing: readonly TranslationEntry[];
  readonly sourceUnits: ReadonlyMap<string, Unit>;
  readonly writingSource: boolean;
}

function unwritable(key: string): AdapterError {
  return new AdapterError(
    "INVALID_STRUCTURE",
    `The XLIFF destination has no unit for "${key}" and the source document has none to copy, so its value could not be written.`,
  );
}

function ancestorNamed(element: Element, name: string): Element | null {
  let node: Node | null = element.parentNode;
  while (node !== null) {
    if (isElement(node) && node.localName === name) {
      return node;
    }
    node = node.parentNode;
  }
  return null;
}

function matchingFile(root: Element, sourceFile: Element | null, attribute: string): Element {
  const files = collectByTag(root, "file");
  const wanted = sourceFile?.getAttribute(attribute) ?? null;
  const match =
    wanted === null ? undefined : files.find((f) => f.getAttribute(attribute) === wanted);
  const file = match ?? files.at(-1);
  if (file === undefined) {
    throw new AdapterError("INVALID_STRUCTURE", "The XLIFF destination has no <file> element.");
  }
  return file;
}

function isWhitespaceText(node: Node | null): boolean {
  return node !== null && node.nodeType === TEXT_NODE && (node.nodeValue ?? "").trim() === "";
}

function appendIndented(doc: Document, container: Element, node: Element): void {
  const trailing = isWhitespaceText(container.lastChild) ? container.lastChild : null;
  const lastElement = elementChildren(container).at(-1);
  const indent = lastElement?.previousSibling ?? null;
  if (isWhitespaceText(indent)) {
    container.insertBefore(doc.createTextNode(indent?.nodeValue ?? ""), trailing);
  }
  container.insertBefore(node, trailing);
}

function createIn(doc: Document, parent: Element, name: string): Element {
  return doc.createElementNS(parent.namespaceURI, name);
}

function insertTargetAfterSource(doc: Document, holder: Element): Element {
  const source = childByName(holder, "seg-source") ?? childByName(holder, "source");
  const target = createIn(doc, holder, "target");
  holder.insertBefore(target, source?.nextSibling ?? null);
  return target;
}

function removeTargets(element: Element): void {
  for (const target of collectByTag(element, "target")) {
    target.parentNode?.removeChild(target);
  }
}

function newSourceOnlyHolder(
  doc: Document,
  container: Element,
  entry: TranslationEntry,
  version: XliffVersion,
): Element {
  const unit = createIn(doc, container, version === "2.0" ? "unit" : "trans-unit");
  unit.setAttribute("id", entry.key);
  if (entry.description !== undefined) {
    const note = createIn(doc, unit, "note");
    note.appendChild(doc.createTextNode(entry.description));
    if (version === "2.0") {
      const notes = createIn(doc, unit, "notes");
      notes.appendChild(note);
      unit.appendChild(notes);
    } else {
      unit.appendChild(note);
    }
  }
  const holder = version === "2.0" ? createIn(doc, unit, "segment") : unit;
  if (holder !== unit) {
    unit.appendChild(holder);
  }
  const source = createIn(doc, holder, "source");
  holder.insertBefore(source, holder.firstChild);
  writeInlineValue(doc, source, entry.value, version);
  return unit;
}

function bodyOf(file: Element): Element {
  const body = childByName(file, "body");
  if (body === null) {
    throw new AdapterError(
      "INVALID_STRUCTURE",
      "The XLIFF destination has a <file> without a <body>.",
    );
  }
  return body;
}

function containerFor(root: Element, version: XliffVersion, sourceUnit: Unit | undefined): Element {
  if (version === "2.0") {
    const sourceFile =
      sourceUnit === undefined ? null : ancestorNamed(sourceUnit.container, "file");
    return matchingFile(root, sourceFile, "id");
  }
  return bodyOf(matchingFile(root, sourceUnit?.scope ?? null, "original"));
}

function hasUnitWithId(root: Element, id: string | null): boolean {
  return id !== null && collectByTag(root, "unit").some((unit) => unit.getAttribute("id") === id);
}

function segmentsOf(owner: Element): Element[] {
  return elementChildren(owner).filter((el) => el.localName === "segment");
}

function cloneSourceUnit(request: AppendRequest, sourceUnit: Unit, key: string): Element {
  const { doc, root, version } = request;
  if (version === "2.0" && hasUnitWithId(root, sourceUnit.owner.getAttribute("id"))) {
    throw unwritable(key);
  }
  const clone = doc.importNode(sourceUnit.owner, true);
  removeTargets(clone);
  appendIndented(doc, containerFor(root, version, sourceUnit), clone);
  return clone;
}

function holderIn(clone: Element, sourceUnit: Unit, version: XliffVersion): Element {
  if (version !== "2.0") {
    return clone;
  }
  const index = segmentsOf(sourceUnit.owner).indexOf(sourceUnit.container);
  return segmentsOf(clone)[index] ?? clone;
}

export function appendMissingUnits(request: AppendRequest): void {
  const { doc, root, version, missing, sourceUnits, writingSource } = request;
  const clones = new Map<Element, Element>();
  for (const entry of missing) {
    if (writingSource) {
      const container = containerFor(root, version, undefined);
      appendIndented(doc, container, newSourceOnlyHolder(doc, container, entry, version));
      continue;
    }
    const sourceUnit = sourceUnits.get(entry.key);
    if (sourceUnit === undefined) {
      throw unwritable(entry.key);
    }
    const clone = clones.get(sourceUnit.owner) ?? cloneSourceUnit(request, sourceUnit, entry.key);
    clones.set(sourceUnit.owner, clone);
    const holder = holderIn(clone, sourceUnit, version);
    writeInlineValue(doc, insertTargetAfterSource(doc, holder), entry.value, version);
  }
}
