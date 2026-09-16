import { DOMParser, type Document, type Element, type Node } from "@xmldom/xmldom";
import { ExchangeError } from "./errors.js";
import { DEFAULT_TMX_LIMITS, type TmxLimits } from "./tmx-limits.js";
import { hasIllegalXmlCharacter } from "./xml-character.js";
import { removeSpans, scanProlog } from "./xml-prolog.js";

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
  readonly segments: readonly TmxSegment[];
}

export interface TmxDocument {
  readonly sourceLanguage: string | undefined;
  readonly units: readonly TmxUnit[];
  readonly skipped: readonly TmxSkippedUnit[];
  /**
   * `tu` elements the walk never reached, because they sit outside the first `body` element. TMX
   * allows exactly one `body`, so this is always zero for a conformant file.
   */
  readonly unreachableUnits: number;
}

export interface ReadTmxOptions {
  readonly limits?: TmxLimits;
}

const ELEMENT_NODE = 1;

const ENTITY_DECLARATION = /<!ENTITY/i;

const UTF8_BOM = "﻿";

const TMX_NAMESPACES: ReadonlySet<string> = new Set(["http://www.lisa.org/tmx14"]);

function invalid(message: string): ExchangeError {
  return new ExchangeError("TMX_INVALID", message);
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
  return removeSpans(text, doctypeSpans);
}

function onWellFormednessProblem(level: "warning" | "error" | "fatalError"): void {
  if (level !== "warning") {
    throw new Error("malformed XML");
  }
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
  let document: Document;
  try {
    document = new DOMParser({ onError: onWellFormednessProblem }).parseFromString(
      text,
      "text/xml",
    );
  } catch {
    throw invalid("The TMX file is not valid XML.");
  }
  assertNoDoctype(document);
  const root = document.documentElement;
  assertTmxRoot(root);
  return root;
}

function isElement(node: Node): node is Element {
  return node.nodeType === ELEMENT_NODE;
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

function assertSegmentLength(text: string, limits: TmxLimits): void {
  if (text.length > limits.maxSegmentLength) {
    throw invalid(
      `The TMX file has a segment longer than the maximum of ${limits.maxSegmentLength} characters.`,
    );
  }
}

function assertSegmentCharacters(text: string): void {
  if (hasIllegalXmlCharacter(text)) {
    throw invalid("The TMX file has a segment carrying a character XML 1.0 does not allow.");
  }
}

function assertLanguageCount(count: number, limits: TmxLimits): void {
  if (count > limits.maxLanguagesPerUnit) {
    throw invalid(
      `The TMX file has a unit with more than the maximum of ${limits.maxLanguagesPerUnit} languages.`,
    );
  }
}

function assertUnitCount(count: number, limits: TmxLimits): void {
  if (count > limits.maxUnitCount) {
    throw invalid(`The TMX file has more than the maximum of ${limits.maxUnitCount} units.`);
  }
}

type UnitScan =
  | { readonly kind: "unit"; readonly segments: TmxSegment[]; readonly markupStripped: boolean }
  | { readonly kind: "skip"; readonly reason: TmxSkipReason };

function scanUnit(tu: Element, limits: TmxLimits): UnitScan {
  const segments: TmxSegment[] = [];
  const seen = new Set<string>();
  let markupStripped = false;
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
    const text = seg.textContent ?? "";
    assertSegmentLength(text, limits);
    assertSegmentCharacters(text);
    markupStripped = markupStripped || elementChildren(seg).length > 0;
    seen.add(language);
    segments.push({ language, text });
    assertLanguageCount(segments.length, limits);
  }
  return segments.length === 0
    ? { kind: "skip", reason: "no-segment" }
    : { kind: "unit", segments, markupStripped };
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
    assertUnitCount(ordinal, limits);
    const scan = scanUnit(tu, limits);
    if (scan.kind === "skip") {
      skipped.push({ ordinal, reason: scan.reason });
      continue;
    }
    units.push({ ordinal, markupStripped: scan.markupStripped, segments: scan.segments });
  }
  return {
    sourceLanguage: headerSourceLanguage(root),
    units,
    skipped,
    unreachableUnits: unreachableUnitCount(root, ordinal),
  };
}
