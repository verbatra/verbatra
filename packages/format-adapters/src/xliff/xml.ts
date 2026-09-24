import type { TranslationEntry } from "@verbatra/core";
import { DOMParser, type Document, type Element, type Node, XMLSerializer } from "@xmldom/xmldom";
import { AdapterError } from "../errors.js";
import type { AdapterFs, BoundedReadOutcome } from "../fs-port.js";
import { outcomeToContent, readBoundedFile } from "../json/bounded-read.js";
import { isEnoent } from "../shell.js";
import { assertNoDoctype, readInlineValue, writeInlineValue, type XliffVersion } from "./inline.js";
import {
  type DeclaredLanguages,
  readsTargets,
  xliff12Languages,
  xliff20Languages,
} from "./languages.js";
import { extractXliffPlaceholders } from "./placeholders.js";

const ELEMENT_NODE = 1;

interface Unit {
  readonly key: string;
  readonly source: Element;
  readonly target: Element | null;
  readonly container: Element;
  readonly languages: DeclaredLanguages;
  readonly scope: Element;
  readonly description?: string;
}

const UNTRANSLATED_STATES = new Set(["new", "needs-translation"]);

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
          languages,
          scope: root,
          ...(description !== undefined ? { description } : {}),
        });
      }
    });
  });
  return units;
}

function documentVersion(root: Element): XliffVersion {
  return (root.getAttribute("version") ?? "1.2").startsWith("2") ? "2.0" : "1.2";
}

function walkUnits(root: Element): Unit[] {
  return documentVersion(root) === "2.0" ? walkXliff20(root) : walkXliff12(root);
}

function isUntranslatedTarget(target: Element): boolean {
  return UNTRANSLATED_STATES.has(target.getAttribute("state") ?? "");
}

function targetValue(target: Element | null): string | undefined {
  if (target === null || isUntranslatedTarget(target)) {
    return undefined;
  }
  const value = readInlineValue(target);
  return value.trim() === "" ? undefined : value;
}

function createRoleResolver(locale: string): (unit: Unit) => boolean {
  const byScope = new Map<Element, boolean>();
  return (unit) => {
    const known = byScope.get(unit.scope);
    if (known !== undefined) {
      return known;
    }
    const hasTargets = collectByTag(unit.scope, "target").length > 0;
    const role = readsTargets(unit.languages, locale, hasTargets);
    byScope.set(unit.scope, role);
    return role;
  };
}

export function parseXliffEntries(
  content: string,
  namespace: string,
  _filePath: string,
  _fs: AdapterFs,
  locale: string,
): Map<string, TranslationEntry> {
  const { root } = parseXml(content);
  const readsTargetOf = createRoleResolver(locale);
  const out = new Map<string, TranslationEntry>();
  const seen = new Set<string>();
  for (const unit of walkUnits(root)) {
    if (seen.has(unit.key)) {
      throw new AdapterError(
        "INVALID_STRUCTURE",
        "The XLIFF file has two trans-units with the same id.",
      );
    }
    seen.add(unit.key);
    const value = readsTargetOf(unit) ? targetValue(unit.target) : readInlineValue(unit.source);
    if (value === undefined) {
      continue;
    }
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

function insertTarget(doc: Document, unit: Unit): Element {
  const target = doc.createElementNS(unit.source.namespaceURI, "target");
  const anchor = childByName(unit.container, "seg-source") ?? unit.source;
  unit.container.insertBefore(target, anchor.nextSibling);
  return target;
}

function markTranslated(target: Element): void {
  if (isUntranslatedTarget(target)) {
    target.setAttribute("state", "translated");
  }
}

export async function serializeXliffEntries(
  entries: ReadonlyMap<string, TranslationEntry>,
  filePath: string,
  fs: AdapterFs,
): Promise<string> {
  const { doc, root } = parseXml(await readDestination(filePath, fs));
  const version = documentVersion(root);
  for (const unit of walkUnits(root)) {
    const entry = entries.get(unit.key);
    if (entry !== undefined) {
      const target = unit.target ?? insertTarget(doc, unit);
      writeInlineValue(doc, target, entry.value, version);
      markTranslated(target);
    }
  }
  return new XMLSerializer().serializeToString(doc);
}
