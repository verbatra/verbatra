import type { Element, Node } from "@xmldom/xmldom";
import type { ExchangeError, ExchangeErrorLocation } from "./errors.js";
import { DEFAULT_TMX_LIMITS, type TmxLimits } from "./tmx-limits.js";
import { hasIllegalXmlCharacter } from "./xml-character.js";
import {
  CDATA_SECTION_NODE,
  childrenNamed,
  elementChildren,
  elementLocation,
  firstChildNamed,
  isElement,
  parseSafeXml,
  pushChildrenInOrder,
  refusal,
  TEXT_NODE,
  type XmlDocumentKind,
} from "./xml-document.js";

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

const SUBFLOW_ELEMENT = "sub";

const TMX_NAMESPACES: ReadonlySet<string> = new Set(["http://www.lisa.org/tmx14"]);

const TMX: XmlDocumentKind = {
  code: "TMX_INVALID",
  label: "TMX",
  unitElements: new Set(["tu"]),
};

function invalid(message: string, location?: ExchangeErrorLocation): ExchangeError {
  return refusal(TMX, message, location);
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

function parseDocumentElement(text: string, limits: TmxLimits): Element {
  const root = parseSafeXml(text, TMX, limits.maxInputBytes);
  assertTmxRoot(root);
  return root;
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
  const root = parseDocumentElement(text, limits);
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
