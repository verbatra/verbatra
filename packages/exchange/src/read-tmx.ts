import { DOMParser, type Element, type Node } from "@xmldom/xmldom";
import { ExchangeError } from "./errors.js";
import { DEFAULT_TMX_LIMITS, type TmxLimits } from "./tmx-limits.js";
import { hasIllegalXmlCharacter } from "./xml-character.js";

export interface TmxSegment {
  readonly language: string;
  readonly text: string;
}

export type TmxSkipReason = "no-segment" | "language-missing" | "duplicate-language";

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
}

export interface ReadTmxOptions {
  readonly limits?: TmxLimits;
}

const ELEMENT_NODE = 1;

const ENTITY_DECLARATION = /<!ENTITY/i;

const DOCTYPE_DECLARATION = /<!DOCTYPE/i;

const UTF8_BOM = "﻿";

function invalid(message: string): ExchangeError {
  return new ExchangeError("TMX_INVALID", message);
}

function assertInputBytes(text: string, limits: TmxLimits): void {
  if (Buffer.byteLength(text, "utf8") > limits.maxInputBytes) {
    throw invalid(`The TMX file is larger than the maximum of ${limits.maxInputBytes} bytes.`);
  }
}

function withoutDoctype(text: string): string {
  if (ENTITY_DECLARATION.test(text)) {
    throw invalid(
      "The TMX file declares an XML entity. Entity declarations are refused, because they can expand without bound or name a file on this machine.",
    );
  }
  const start = text.search(DOCTYPE_DECLARATION);
  if (start === -1) {
    return text;
  }
  const end = text.indexOf(">", start);
  if (end === -1) {
    throw invalid("The TMX file is not valid XML: its DOCTYPE declaration is never closed.");
  }
  if (text.slice(start, end).includes("[")) {
    throw invalid(
      "The TMX file declares an internal DTD subset, which is refused because it can declare an entity.",
    );
  }
  return `${text.slice(0, start)}${text.slice(end + 1)}`;
}

function onFatal(level: "warning" | "error" | "fatalError"): void {
  if (level === "fatalError") {
    throw new Error("malformed XML");
  }
}

function parseDocumentElement(text: string): Element {
  let root: Element | null;
  try {
    root = new DOMParser({ onError: onFatal }).parseFromString(text, "text/xml").documentElement;
  } catch {
    throw invalid("The TMX file is not valid XML.");
  }
  if (root === null || root.localName !== "tmx") {
    throw invalid("The file is not a TMX document: its root element is not <tmx>.");
  }
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
  const header = firstChildNamed(root, "header");
  const declared = header?.getAttribute("srclang") ?? undefined;
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

type UnitScan =
  | { readonly kind: "unit"; readonly segments: TmxSegment[]; readonly markupStripped: boolean }
  | { readonly kind: "skip"; readonly reason: TmxSkipReason };

function assertLanguageCount(count: number, limits: TmxLimits): void {
  if (count > limits.maxLanguagesPerUnit) {
    throw invalid(
      `The TMX file has a unit with more than the maximum of ${limits.maxLanguagesPerUnit} languages.`,
    );
  }
}

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
    const seg = firstChildNamed(tuv, "seg");
    if (seg === undefined) {
      return { kind: "skip", reason: "no-segment" };
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

function assertUnitCount(count: number, limits: TmxLimits): void {
  if (count > limits.maxUnitCount) {
    throw invalid(`The TMX file has more than the maximum of ${limits.maxUnitCount} units.`);
  }
}

/**
 * Parses a TMX 1.4b translation memory into plain-text segments.
 *
 * The input is treated as untrusted third-party data throughout: the size is bounded before the
 * parser sees it, entity declarations and internal DTD subsets are refused outright, a bare
 * external doctype is discarded rather than fetched, and unit, language, and segment-length bounds
 * are enforced during the walk. Inline markup (`bpt`, `ept`, `ph`, `it`) is flattened to its text
 * and reported on {@link TmxUnit.markupStripped}; a unit that cannot be read at all is reported on
 * {@link TmxDocument.skipped} rather than dropped silently or treated as fatal.
 *
 * @param text - The whole TMX document, decoded as UTF-8.
 * @param options - Optional limit overrides; {@link DEFAULT_TMX_LIMITS} otherwise.
 * @returns The header source language, the readable units, and the units that were skipped.
 *
 * @throws {@link ExchangeError} `TMX_INVALID`: the document is oversized, not well-formed XML, not
 * a TMX document, declares an entity or an internal DTD subset, or breaks one of the limits.
 *
 * @example
 * ```ts
 * const memory = readTmx(await readFile("memory.tmx", "utf8"));
 * for (const unit of memory.units) {
 *   console.log(unit.segments.map((segment) => `${segment.language}: ${segment.text}`));
 * }
 * ```
 */
export function readTmx(text: string, options: ReadTmxOptions = {}): TmxDocument {
  const limits = options.limits ?? DEFAULT_TMX_LIMITS;
  assertInputBytes(text, limits);
  const withoutBom = text.startsWith(UTF8_BOM) ? text.slice(UTF8_BOM.length) : text;
  const root = parseDocumentElement(withoutDoctype(withoutBom));
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
  return { sourceLanguage: headerSourceLanguage(root), units, skipped };
}
