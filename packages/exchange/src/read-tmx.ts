import { DOMParser, type Document, type Element, type Node } from "@xmldom/xmldom";
import { ExchangeError, type ExchangeErrorLocation } from "./errors.js";
import { DEFAULT_TMX_LIMITS, type TmxLimits } from "./tmx-limits.js";
import { hasIllegalXmlCharacter } from "./xml-character.js";
import { blankSpans, scanProlog } from "./xml-prolog.js";

export interface TmxSegment {
  readonly language: string;
  readonly text: string;
}

export type TmxSkipReason =
  | "no-segment"
  | "language-missing"
  | "duplicate-language"
  | "multiple-segments";

export interface TmxSkippedUnit {
  readonly ordinal: number;
  readonly reason: TmxSkipReason;
}

export interface TmxUnit {
  readonly ordinal: number;
  readonly markupStripped: boolean;
  readonly subflowDropped: boolean;
  readonly segments: readonly TmxSegment[];
}

export interface TmxDocument {
  readonly sourceLanguage: string | undefined;
  readonly units: readonly TmxUnit[];
  readonly skipped: readonly TmxSkippedUnit[];
  readonly unreachableUnits: number;
}

export interface ReadTmxOptions {
  readonly limits?: TmxLimits;
}

const ELEMENT_NODE = 1;

const TEXT_NODE = 3;

const CDATA_SECTION_NODE = 4;

const SUBFLOW_ELEMENT = "sub";

const ENTITY_DECLARATION = /<!ENTITY/i;

const UTF8_BOM = "﻿";

const TMX_NAMESPACES: ReadonlySet<string> = new Set(["http://www.lisa.org/tmx14"]);

const PARSER_MESSAGE_LIMIT = 160;

const CONTROL_CHARACTER_SOURCE = "[\\u0000-\\u001F\\u007F-\\u009F]";

const CONTROL_CHARACTERS = new RegExp(CONTROL_CHARACTER_SOURCE, "g");

const NESTED_ERROR_PREFIX = /(^|: )Error: /g;

function invalid(message: string, location?: ExchangeErrorLocation): ExchangeError {
  return new ExchangeError("TMX_INVALID", message, location);
}

function isElement(node: Node): node is Element {
  return node.nodeType === ELEMENT_NODE;
}

function elementLocation(element: Element, unit?: number): ExchangeErrorLocation | undefined {
  const { lineNumber, columnNumber } = element;
  /* v8 ignore next 3 -- the parser is always built with its locator on, so every element carries a position. */
  if (lineNumber === undefined || columnNumber === undefined) {
    return undefined;
  }
  const at = { line: lineNumber, column: columnNumber };
  return unit === undefined ? at : { ...at, unit };
}

function assertInputBytes(text: string, limits: TmxLimits): void {
  if (Buffer.byteLength(text, "utf8") > limits.maxInputBytes) {
    throw invalid(`The TMX file is larger than the maximum of ${limits.maxInputBytes} bytes.`);
  }
}

function withoutProlog(text: string): string {
  const { rootStart, doctypeSpans } = scanProlog(text);
  if (ENTITY_DECLARATION.test(text.slice(0, rootStart))) {
    throw invalid(
      "The TMX file declares an XML entity. Entity declarations are refused, because they can expand without bound or name a file on this machine.",
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

function enclosingUnit(node: Node | null | undefined): Element | undefined {
  for (let current = node ?? null; current !== null; current = current.parentNode) {
    if (isElement(current) && current.localName === "tu") {
      return current;
    }
  }
  return undefined;
}

function unitOrdinal(tu: Element): number {
  let ordinal = 1;
  for (let sibling = tu.previousSibling; sibling !== null; sibling = sibling.previousSibling) {
    if (isElement(sibling) && sibling.localName === "tu") {
      ordinal += 1;
    }
  }
  return ordinal;
}

function parserLocation(context: ParserContext): ExchangeErrorLocation | undefined {
  const line = context.locator?.lineNumber;
  const column = context.locator?.columnNumber;
  /* v8 ignore next 3 -- the parser is always built with its locator on, so a report always carries a position. */
  if (line === undefined || column === undefined) {
    return undefined;
  }
  const tu = enclosingUnit(context.currentElement);
  return tu === undefined ? { line, column } : { line, column, unit: unitOrdinal(tu) };
}

function describeParserMessage(message: string): string {
  const flat = message
    .replace(CONTROL_CHARACTERS, " ")
    .replace(NESTED_ERROR_PREFIX, "$1")
    .trimEnd();
  return flat.length > PARSER_MESSAGE_LIMIT ? `${flat.slice(0, PARSER_MESSAGE_LIMIT)}...` : flat;
}

function assertNoDoctype(document: Document): void {
  const doctype = document.doctype;
  /* v8 ignore next 6 -- backstop: scanProlog already refuses an internal subset before the parser runs, so this fires only if that scan and the parser ever disagree. */
  if (doctype !== null && doctype.internalSubset != null && doctype.internalSubset !== "") {
    throw invalid(
      "The TMX file declares an internal DTD subset, which is refused because it can declare an entity.",
    );
  }
}

function assertTmxRoot(root: Element | null): asserts root is Element {
  if (root === null || root.localName !== "tmx") {
    throw invalid("The file is not a TMX document: its root element is not <tmx>.");
  }
  const namespace = root.namespaceURI;
  if (namespace !== null && !TMX_NAMESPACES.has(namespace)) {
    throw invalid(
      `The file is not a TMX document: its root element is in the namespace "${namespace}".`,
    );
  }
}

function parseDocumentElement(text: string): Element {
  let problem: ParseProblem | undefined;
  const onError = (
    level: "warning" | "error" | "fatalError",
    message: string,
    context: ParserContext,
  ): void => {
    if (level === "warning") {
      return;
    }
    problem = { description: describeParserMessage(message), location: parserLocation(context) };
    throw new Error("malformed XML");
  };
  let document: Document;
  try {
    document = new DOMParser({ onError }).parseFromString(text, "text/xml");
  } catch {
    const detail = problem === undefined ? "" : `: ${problem.description}`;
    throw invalid(`The TMX file is not valid XML${detail}.`, problem?.location);
  }
  assertNoDoctype(document);
  const root = document.documentElement;
  assertTmxRoot(root);
  return root;
}

function elementChildren(parent: Element): Element[] {
  return Array.from(parent.childNodes).filter(isElement);
}

function childrenNamed(parent: Element, name: string): Element[] {
  return elementChildren(parent).filter((child) => child.localName === name);
}

function firstChildNamed(parent: Element, name: string): Element | undefined {
  return childrenNamed(parent, name)[0];
}

function headerSourceLanguage(root: Element): string | undefined {
  const declared = firstChildNamed(root, "header")?.getAttribute("srclang") ?? undefined;
  return declared === undefined || declared === "" ? undefined : declared;
}

function bodyOf(root: Element): Element {
  const body = firstChildNamed(root, "body");
  if (body === undefined) {
    throw invalid("The TMX file has no <body> element, so it holds no translation units.");
  }
  return body;
}

function segmentLanguage(tuv: Element): string | undefined {
  const declared = tuv.getAttribute("xml:lang") ?? tuv.getAttribute("lang");
  return declared === null || declared === "" ? undefined : declared;
}

function assertSegmentLength(
  text: string,
  limits: TmxLimits,
  where: ExchangeErrorLocation | undefined,
): void {
  if (text.length > limits.maxSegmentLength) {
    throw invalid(
      `The TMX file has a segment longer than the maximum of ${limits.maxSegmentLength} characters.`,
      where,
    );
  }
}

function assertSegmentCharacters(text: string, where: ExchangeErrorLocation | undefined): void {
  if (hasIllegalXmlCharacter(text)) {
    throw invalid("The TMX file has a segment carrying a character XML 1.0 does not allow.", where);
  }
}

function assertLanguageCount(
  count: number,
  limits: TmxLimits,
  where: ExchangeErrorLocation | undefined,
): void {
  if (count > limits.maxLanguagesPerUnit) {
    throw invalid(
      `The TMX file has a unit with more than the maximum of ${limits.maxLanguagesPerUnit} languages.`,
      where,
    );
  }
}

function assertUnitCount(count: number, limits: TmxLimits, tu: Element): void {
  if (count > limits.maxUnitCount) {
    throw invalid(
      `The TMX file has more than the maximum of ${limits.maxUnitCount} units.`,
      elementLocation(tu, count),
    );
  }
}

interface SegmentText {
  readonly text: string;
  readonly subflowDropped: boolean;
}

function pushChildrenInOrder(pending: Node[], parent: Node): void {
  const children = parent.childNodes;
  for (let index = children.length - 1; index >= 0; index -= 1) {
    const child = children.item(index);
    if (child !== null) {
      pending.push(child);
    }
  }
}

function segmentText(seg: Element): SegmentText {
  const parts: string[] = [];
  let subflowDropped = false;
  const pending: Node[] = [];
  pushChildrenInOrder(pending, seg);
  for (let node = pending.pop(); node !== undefined; node = pending.pop()) {
    if (node.nodeType === TEXT_NODE || node.nodeType === CDATA_SECTION_NODE) {
      parts.push(node.nodeValue ?? "");
    } else if (isElement(node) && node.localName === SUBFLOW_ELEMENT) {
      subflowDropped = true;
    } else if (isElement(node)) {
      pushChildrenInOrder(pending, node);
    }
  }
  return { text: parts.join(""), subflowDropped };
}

type UnitScan =
  | {
      readonly kind: "unit";
      readonly segments: TmxSegment[];
      readonly markupStripped: boolean;
      readonly subflowDropped: boolean;
    }
  | { readonly kind: "skip"; readonly reason: TmxSkipReason };

function scanUnit(tu: Element, ordinal: number, limits: TmxLimits): UnitScan {
  const segments: TmxSegment[] = [];
  const seen = new Set<string>();
  let markupStripped = false;
  let subflowDropped = false;
  for (const tuv of childrenNamed(tu, "tuv")) {
    const language = segmentLanguage(tuv);
    if (language === undefined) {
      return { kind: "skip", reason: "language-missing" };
    }
    if (seen.has(language)) {
      return { kind: "skip", reason: "duplicate-language" };
    }
    const segs = childrenNamed(tuv, "seg");
    const seg = segs[0];
    if (seg === undefined) {
      return { kind: "skip", reason: "no-segment" };
    }
    if (segs.length > 1) {
      return { kind: "skip", reason: "multiple-segments" };
    }
    const { text, subflowDropped: dropped } = segmentText(seg);
    assertSegmentLength(text, limits, elementLocation(seg, ordinal));
    assertSegmentCharacters(text, elementLocation(seg, ordinal));
    markupStripped = markupStripped || elementChildren(seg).length > 0;
    subflowDropped = subflowDropped || dropped;
    seen.add(language);
    segments.push({ language, text });
    assertLanguageCount(segments.length, limits, elementLocation(tuv, ordinal));
  }
  return segments.length === 0
    ? { kind: "skip", reason: "no-segment" }
    : { kind: "unit", segments, markupStripped, subflowDropped };
}

function unreachableUnitCount(root: Element, walked: number): number {
  return Math.max(0, Array.from(root.getElementsByTagName("tu")).length - walked);
}

export function readTmx(text: string, options: ReadTmxOptions = {}): TmxDocument {
  const limits = options.limits ?? DEFAULT_TMX_LIMITS;
  assertInputBytes(text, limits);
  const withoutBom = text.startsWith(UTF8_BOM) ? text.slice(UTF8_BOM.length) : text;
  const root = parseDocumentElement(withoutProlog(withoutBom));
  const units: TmxUnit[] = [];
  const skipped: TmxSkippedUnit[] = [];
  let ordinal = 0;
  for (const tu of childrenNamed(bodyOf(root), "tu")) {
    ordinal += 1;
    assertUnitCount(ordinal, limits, tu);
    const scan = scanUnit(tu, ordinal, limits);
    if (scan.kind === "skip") {
      skipped.push({ ordinal, reason: scan.reason });
      continue;
    }
    units.push({
      ordinal,
      markupStripped: scan.markupStripped,
      subflowDropped: scan.subflowDropped,
      segments: scan.segments,
    });
  }
  return {
    sourceLanguage: headerSourceLanguage(root),
    units,
    skipped,
    unreachableUnits: unreachableUnitCount(root, ordinal),
  };
}
