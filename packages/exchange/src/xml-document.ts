import { DOMParser, type Document, type Element, type Node } from "@xmldom/xmldom";
import { ExchangeError, type ExchangeErrorCode, type ExchangeErrorLocation } from "./errors.js";
import { blankSpans, scanProlog } from "./xml-prolog.js";

export interface XmlDocumentKind {
  readonly code: ExchangeErrorCode;
  readonly label: string;
  readonly unitElements: ReadonlySet<string>;
}

export const ELEMENT_NODE = 1;

export const TEXT_NODE = 3;

export const CDATA_SECTION_NODE = 4;

const ENTITY_DECLARATION = /<!ENTITY/i;

const UTF8_BOM = "﻿";

const PARSER_MESSAGE_LIMIT = 160;

const CONTROL_CHARACTER_SOURCE = "[\\u0000-\\u001F\\u007F-\\u009F]";

const CONTROL_CHARACTERS = new RegExp(CONTROL_CHARACTER_SOURCE, "g");

const NESTED_ERROR_PREFIX = /(^|: )Error: /g;

export function refusal(
  kind: XmlDocumentKind,
  message: string,
  location?: ExchangeErrorLocation,
): ExchangeError {
  return new ExchangeError(kind.code, message, location);
}

export function isElement(node: Node): node is Element {
  return node.nodeType === ELEMENT_NODE;
}

export function elementLocation(
  element: Element,
  unit?: number,
): ExchangeErrorLocation | undefined {
  const { lineNumber, columnNumber } = element;
  /* v8 ignore next 3 -- the parser is always built with its locator on, so every element carries a position. */
  if (lineNumber === undefined || columnNumber === undefined) {
    return undefined;
  }
  const at = { line: lineNumber, column: columnNumber };
  return unit === undefined ? at : { ...at, unit };
}

function assertInputBytes(text: string, kind: XmlDocumentKind, maxInputBytes: number): void {
  if (Buffer.byteLength(text, "utf8") > maxInputBytes) {
    throw refusal(
      kind,
      `The ${kind.label} file is larger than the maximum of ${maxInputBytes} bytes.`,
    );
  }
}

function withoutProlog(text: string, kind: XmlDocumentKind): string {
  const { rootStart, doctypeSpans } = scanProlog(text, kind.code);
  if (ENTITY_DECLARATION.test(text.slice(0, rootStart))) {
    throw refusal(
      kind,
      `The ${kind.label} file declares an XML entity. Entity declarations are refused, because they can expand without bound or name a file on this machine.`,
    );
  }
  return blankSpans(text, doctypeSpans);
}

interface ParserLocator {
  readonly lineNumber?: number;
  readonly columnNumber?: number;
}

interface ParserContext {
  readonly locator?: ParserLocator;
  readonly currentElement?: Node | null;
}

interface ParseProblem {
  readonly description: string;
  readonly location: ExchangeErrorLocation | undefined;
}

function enclosingUnit(node: Node | null | undefined, kind: XmlDocumentKind): Element | undefined {
  for (let current = node ?? null; current !== null; current = current.parentNode) {
    if (isElement(current) && kind.unitElements.has(current.localName ?? "")) {
      return current;
    }
  }
  return undefined;
}

function unitOrdinal(unit: Element): number {
  let ordinal = 1;
  for (let sibling = unit.previousSibling; sibling !== null; sibling = sibling.previousSibling) {
    if (isElement(sibling) && sibling.localName === unit.localName) {
      ordinal += 1;
    }
  }
  return ordinal;
}

function parserLocation(
  context: ParserContext,
  kind: XmlDocumentKind,
): ExchangeErrorLocation | undefined {
  const line = context.locator?.lineNumber;
  const column = context.locator?.columnNumber;
  /* v8 ignore next 3 -- the parser is always built with its locator on, so a report always carries a position. */
  if (line === undefined || column === undefined) {
    return undefined;
  }
  const unit = enclosingUnit(context.currentElement, kind);
  return unit === undefined ? { line, column } : { line, column, unit: unitOrdinal(unit) };
}

function describeParserMessage(message: string): string {
  const flat = message
    .replace(CONTROL_CHARACTERS, " ")
    .replace(NESTED_ERROR_PREFIX, "$1")
    .trimEnd();
  return flat.length > PARSER_MESSAGE_LIMIT ? `${flat.slice(0, PARSER_MESSAGE_LIMIT)}...` : flat;
}

function assertNoDoctype(document: Document, kind: XmlDocumentKind): void {
  const doctype = document.doctype;
  /* v8 ignore next 7 -- backstop: scanProlog already refuses an internal subset before the parser runs, so this fires only if that scan and the parser ever disagree. */
  if (doctype !== null && doctype.internalSubset != null && doctype.internalSubset !== "") {
    throw refusal(
      kind,
      `The ${kind.label} file declares an internal DTD subset, which is refused because it can declare an entity.`,
    );
  }
}

function parseDocument(text: string, kind: XmlDocumentKind): Document {
  let problem: ParseProblem | undefined;
  const onError = (
    level: "warning" | "error" | "fatalError",
    message: string,
    context: ParserContext,
  ): void => {
    if (level === "warning") {
      return;
    }
    problem = {
      description: describeParserMessage(message),
      location: parserLocation(context, kind),
    };
    throw new Error("malformed XML");
  };
  try {
    return new DOMParser({ onError }).parseFromString(text, "text/xml");
  } catch {
    const detail = problem === undefined ? "" : `: ${problem.description}`;
    throw refusal(kind, `The ${kind.label} file is not valid XML${detail}.`, problem?.location);
  }
}

export function parseSafeXml(
  text: string,
  kind: XmlDocumentKind,
  maxInputBytes: number,
): Element | null {
  assertInputBytes(text, kind, maxInputBytes);
  const withoutBom = text.startsWith(UTF8_BOM) ? text.slice(UTF8_BOM.length) : text;
  const document = parseDocument(withoutProlog(withoutBom, kind), kind);
  assertNoDoctype(document, kind);
  return document.documentElement;
}

export function elementChildren(parent: Element): Element[] {
  return Array.from(parent.childNodes).filter(isElement);
}

export function childrenNamed(parent: Element, name: string): Element[] {
  return elementChildren(parent).filter((child) => child.localName === name);
}

export function firstChildNamed(parent: Element, name: string): Element | undefined {
  return childrenNamed(parent, name)[0];
}

export function pushChildrenInOrder(pending: { push(node: Node): unknown }, parent: Node): void {
  const children = parent.childNodes;
  for (let index = children.length - 1; index >= 0; index -= 1) {
    const child = children.item(index);
    if (child !== null) {
      pending.push(child);
    }
  }
}
