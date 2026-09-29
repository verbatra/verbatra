import type { Element } from "@xmldom/xmldom";
import type { ExchangeError, ExchangeErrorLocation } from "./errors.js";
import { readXliff2Units } from "./read-xliff2.js";
import { readXliff12Units } from "./read-xliff12.js";
import {
  XLIFF2_NAMESPACE,
  XLIFF12_NAMESPACE,
  type XliffState,
  type XliffVersion,
} from "./xliff-vocabulary.js";
import { elementLocation, parseSafeXml, refusal, type XmlDocumentKind } from "./xml-document.js";

export interface XliffUnit {
  readonly ordinal: number;
  readonly line: number | undefined;
  readonly key: string;
  readonly source: string;
  readonly target: string | undefined;
  readonly state: XliffState;
  readonly sourceHash: string | undefined;
}

export type XliffUnitField = "id" | "source" | "target";

export interface XliffUnitProblem {
  readonly ordinal: number;
  readonly line: number | undefined;
  readonly field: XliffUnitField;
}

export interface XliffDocument {
  readonly version: XliffVersion;
  readonly sourceLanguage: string | undefined;
  readonly targetLanguage: string | undefined;
  readonly units: readonly XliffUnit[];
  readonly problems: readonly XliffUnitProblem[];
}

export interface XliffLimits {
  readonly maxInputBytes: number;
  readonly maxUnitCount: number;
  readonly maxSegmentLength: number;
}

export const DEFAULT_XLIFF_LIMITS: XliffLimits = {
  maxInputBytes: 32 * 1024 * 1024,
  maxUnitCount: 200_000,
  maxSegmentLength: 64 * 1024,
};

export interface ReadXliffOptions {
  readonly limits?: XliffLimits;
}

export interface UnitReadContext {
  readonly limits: XliffLimits;
  readonly units: XliffUnit[];
  readonly problems: XliffUnitProblem[];
  ordinal: number;
}

export interface UnitBody {
  readonly key: string | undefined;
  readonly source: string | undefined;
  readonly target: string | undefined | null;
  readonly state: XliffState;
  readonly sourceHash: string | undefined;
}

export const XLIFF: XmlDocumentKind = {
  code: "XLIFF_INVALID",
  label: "XLIFF",
  unitElements: new Set(["unit", "trans-unit"]),
};

function invalid(message: string, location?: ExchangeErrorLocation): ExchangeError {
  return refusal(XLIFF, message, location);
}

function assertLength(text: string | undefined, context: UnitReadContext, unit: Element): void {
  if (text !== undefined && text.length > context.limits.maxSegmentLength) {
    throw invalid(
      `The XLIFF file has a segment longer than the maximum of ${context.limits.maxSegmentLength} characters.`,
      elementLocation(unit, context.ordinal),
    );
  }
}

interface CompleteBody {
  readonly key: string;
  readonly source: string;
  readonly target: string | undefined;
}

function completeBody(body: UnitBody): CompleteBody | XliffUnitField {
  if (body.key === undefined) {
    return "id";
  }
  if (body.source === undefined) {
    return "source";
  }
  if (body.target === null) {
    return "target";
  }
  return { key: body.key, source: body.source, target: body.target };
}

export function recordUnit(context: UnitReadContext, unit: Element, body: UnitBody): void {
  context.ordinal += 1;
  if (context.ordinal > context.limits.maxUnitCount) {
    throw invalid(
      `The XLIFF file has more than the maximum of ${context.limits.maxUnitCount} units.`,
      elementLocation(unit, context.ordinal),
    );
  }
  const line = unit.lineNumber;
  const complete = completeBody(body);
  if (typeof complete === "string") {
    context.problems.push({ ordinal: context.ordinal, line, field: complete });
    return;
  }
  assertLength(complete.source, context, unit);
  assertLength(complete.target, context, unit);
  context.units.push({
    ordinal: context.ordinal,
    line,
    ...complete,
    state: body.state,
    sourceHash: body.sourceHash,
  });
}

export function nonEmptyAttribute(element: Element, name: string): string | undefined {
  const value = element.getAttribute(name);
  return value === null || value === "" ? undefined : value;
}

function assertXliffRoot(root: Element | null): asserts root is Element {
  if (root === null || root.localName !== "xliff") {
    throw invalid("The file is not an XLIFF document: its root element is not <xliff>.");
  }
}

function versionOf(root: Element): XliffVersion {
  const version = root.getAttribute("version");
  const namespace = root.namespaceURI;
  if (version === "1.2" && (namespace === null || namespace === XLIFF12_NAMESPACE)) {
    return "1.2";
  }
  if ((version === "2.0" || version === "2.1") && namespace === XLIFF2_NAMESPACE) {
    return "2.0";
  }
  throw invalid(
    `The XLIFF file declares version "${version ?? ""}" in the namespace "${namespace ?? ""}"; only XLIFF 1.2 and 2.x are read.`,
  );
}

export function readXliff(text: string, options: ReadXliffOptions = {}): XliffDocument {
  const limits = options.limits ?? DEFAULT_XLIFF_LIMITS;
  const root = parseSafeXml(text, XLIFF, limits.maxInputBytes);
  assertXliffRoot(root);
  const version = versionOf(root);
  const context: UnitReadContext = { limits, units: [], problems: [], ordinal: 0 };
  const languages =
    version === "2.0" ? readXliff2Units(root, context) : readXliff12Units(root, context);
  return { version, ...languages, units: context.units, problems: context.problems };
}
